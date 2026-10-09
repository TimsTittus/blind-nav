/**
 * ONNX Runtime Web backend: WebGPU where the device really has a GPU, WASM
 * otherwise.
 *
 * Client-only. `onnxruntime-web` is imported dynamically so neither the runtime
 * nor its WASM artifacts land in the initial bundle, and so a build that never
 * enables local perception never pays for it.
 *
 * Weights are **not shipped with the app.** The Phase 13 licence review
 * (ADR 0026) is unresolved for SeaFormer/ADE20K weights, so the model is
 * fetched from a configurable URL that is absent by default; a missing file
 * surfaces as {@link LocalBackendUnavailableError}, never as a silent "clear".
 */
import { z } from "zod";
import {
  LocalBackendUnavailableError,
  type LocalInferenceResult,
  type LocalVisionBackend,
  type RgbaFrame,
} from "./backend";
import {
  DEFAULT_CLASSES_URL,
  DEFAULT_INPUT_SIZE,
  DEFAULT_MODEL_URL,
} from "./config";
import { logitsToGrid, type LogitsTensor } from "./logits";

/** mmsegmentation's ImageNet normalisation, matching the Phase 13 export. */
const MEAN = [123.675, 116.28, 103.53] as const;
const STD = [58.395, 57.12, 57.375] as const;

/** Model output name the export traces. */
const LOGITS_OUTPUT = "logits";
const PIXEL_INPUT = "pixel_values";

/** Class names are external data, so they are parsed, not trusted. */
const ClassesSchema = z.array(z.string().min(1)).min(2).max(1000);

export interface OnnxBackendOptions {
  modelUrl?: string;
  classesUrl?: string;
  inputSize?: number;
  /** Try the WebGPU execution provider first. */
  preferWebGpu?: boolean;
  /** WASM threads. Requires cross-origin isolation; falls back to 1. */
  threads?: number;
  modelId?: string;
  fetchImpl?: typeof fetch;
}

type OrtModule = typeof import("onnxruntime-web");
type OrtSession = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;

/**
 * ORT only reports whether an execution provider *initialised*, so WebGPU
 * availability is checked against the browser API first. A software adapter
 * (SwiftShader) is slower than WASM, so it is not treated as a GPU.
 */
async function webGpuAvailable(): Promise<boolean> {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<unknown | null> };
    }
  ).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

export class OnnxVisionBackend implements LocalVisionBackend {
  readonly id: string;
  readonly modelId: string;
  readonly inputSize: number;

  private session: OrtSession | null;
  private readonly ort: OrtModule;
  private readonly classes: readonly string[];
  /** Reused across frames so steady-state inference allocates nothing. */
  private readonly input: Float32Array;

  private constructor(args: {
    ort: OrtModule;
    session: OrtSession;
    classes: readonly string[];
    inputSize: number;
    executionProvider: string;
    modelId: string;
  }) {
    this.ort = args.ort;
    this.session = args.session;
    this.classes = args.classes;
    this.inputSize = args.inputSize;
    this.id = `onnx-${args.executionProvider}`;
    this.modelId = args.modelId;
    this.input = new Float32Array(3 * args.inputSize * args.inputSize);
  }

  static async create(
    options: OnnxBackendOptions = {},
  ): Promise<OnnxVisionBackend> {
    const modelUrl = options.modelUrl ?? DEFAULT_MODEL_URL;
    const classesUrl = options.classesUrl ?? DEFAULT_CLASSES_URL;
    const inputSize = options.inputSize ?? DEFAULT_INPUT_SIZE;
    const doFetch = options.fetchImpl ?? fetch;

    let ort: OrtModule;
    try {
      ort = await import("onnxruntime-web");
    } catch (cause) {
      throw new LocalBackendUnavailableError(
        "ONNX Runtime Web could not be loaded.",
        { cause },
      );
    }

    const [model, classes] = await Promise.all([
      fetchModel(doFetch, modelUrl),
      fetchClasses(doFetch, classesUrl),
    ]);

    // Threads need SharedArrayBuffer, which needs cross-origin isolation.
    const isolated =
      typeof globalThis.crossOriginIsolated === "boolean"
        ? globalThis.crossOriginIsolated
        : false;
    ort.env.wasm.numThreads = isolated ? (options.threads ?? 4) : 1;

    const useWebGpu =
      (options.preferWebGpu ?? true) && (await webGpuAvailable());
    const providers = useWebGpu ? ["webgpu", "wasm"] : ["wasm"];

    let session: OrtSession;
    let executionProvider: string;
    try {
      session = await ort.InferenceSession.create(model, {
        executionProviders: providers,
        graphOptimizationLevel: "all",
        // Idle sessions must not busy-spin: the cloud path, the UI and speech
        // share this thread (ADR 0026 §4).
        extra: {
          session: {
            intra_op: { allow_spinning: "0" },
            inter_op: { allow_spinning: "0" },
          },
        },
      });
      executionProvider = useWebGpu ? "webgpu" : "wasm";
    } catch (cause) {
      if (!useWebGpu) {
        throw new LocalBackendUnavailableError(
          "ONNX session could not be created.",
          { cause },
        );
      }
      // WebGPU can fail after the adapter check (driver, shader limits).
      session = await ort.InferenceSession.create(model, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      executionProvider = "wasm";
    }

    return new OnnxVisionBackend({
      ort,
      session,
      classes,
      inputSize,
      executionProvider,
      modelId: options.modelId ?? modelIdFromUrl(modelUrl),
    });
  }

  async infer(
    frame: RgbaFrame,
    signal?: AbortSignal,
  ): Promise<LocalInferenceResult> {
    const session = this.session;
    if (!session) {
      throw new LocalBackendUnavailableError("Backend has been disposed.");
    }
    if (frame.width !== this.inputSize || frame.height !== this.inputSize) {
      throw new Error(
        `Frame must be ${this.inputSize}×${this.inputSize}, got ${frame.width}×${frame.height}.`,
      );
    }
    throwIfAborted(signal);

    const plane = this.inputSize * this.inputSize;
    const { data } = frame;
    for (let i = 0; i < plane; i++) {
      const base = i * 4;
      for (let channel = 0; channel < 3; channel++) {
        this.input[channel * plane + i] =
          ((data[base + channel] ?? 0) - (MEAN[channel] ?? 0)) /
          (STD[channel] ?? 1);
      }
    }

    const tensor = new this.ort.Tensor("float32", this.input, [
      1,
      3,
      this.inputSize,
      this.inputSize,
    ]);

    const startedAt = performance.now();
    const output = await session.run({ [PIXEL_INPUT]: tensor });
    const inferenceMs = performance.now() - startedAt;
    throwIfAborted(signal);

    const logits = output[LOGITS_OUTPUT];
    if (!logits) {
      throw new Error(`Model produced no "${LOGITS_OUTPUT}" output.`);
    }

    return {
      segmentation: logitsToGrid(
        {
          dims: logits.dims,
          data: logits.data as Float32Array,
        } satisfies LogitsTensor,
        this.classes,
      ),
      inferenceMs,
    };
  }

  dispose(): void {
    const session = this.session;
    this.session = null;
    void session?.release?.();
  }
}

async function fetchModel(
  doFetch: typeof fetch,
  url: string,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await doFetch(url);
  } catch (cause) {
    throw new LocalBackendUnavailableError(
      `Local model could not be fetched from ${url}.`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new LocalBackendUnavailableError(
      `Local model is not available at ${url} (HTTP ${response.status}). ` +
        "Weights are not shipped with the app; see src/fast-perception/README.md.",
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchClasses(
  doFetch: typeof fetch,
  url: string,
): Promise<readonly string[]> {
  let response: Response;
  try {
    response = await doFetch(url);
  } catch (cause) {
    throw new LocalBackendUnavailableError(
      `Model class names could not be fetched from ${url}.`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new LocalBackendUnavailableError(
      `Model class names are not available at ${url} (HTTP ${response.status}).`,
    );
  }
  const parsed = ClassesSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new LocalBackendUnavailableError(
      `Model class names at ${url} are not a list of class names.`,
    );
  }
  return parsed.data;
}

function modelIdFromUrl(url: string): string {
  const name = url.split("/").pop() ?? url;
  return name.replace(/\.onnx$/u, "") || "unknown-model";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Local inference was aborted.", "AbortError");
  }
}
