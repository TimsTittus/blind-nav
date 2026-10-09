/**
 * Loads a candidate and exposes a uniform `run(image)` that returns a compact
 * output summary plus stage timings. Shared by the per-process benchmark and
 * the interleaved (same-conditions) latency comparison.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  AutoImageProcessor,
  AutoModelForDepthEstimation,
  AutoModelForSemanticSegmentation,
  env,
  pipeline,
  RawImage,
  type Tensor,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-node";
import type { Candidate } from "./candidates";
import { GRID_H, GRID_W, type RawOutput } from "./raw-output";

export const CACHE_DIR = fileURLToPath(new URL("../.cache", import.meta.url));
export const MODELS_DIR = fileURLToPath(new URL("../models", import.meta.url));
env.cacheDir = CACHE_DIR;

const MMSEG_MEAN = [123.675, 116.28, 103.53];
const MMSEG_STD = [58.395, 57.12, 57.375];

export interface RunResult {
  output: RawOutput;
  /** Stage timings in ms; pipeline runners report everything under `model`. */
  pre: number;
  model: number;
  post: number;
  /** Tensor shape fed to the model, when known. */
  shape: number[];
}

export interface Runner {
  run(img: RawImage): Promise<RunResult>;
}

export async function modelFileMB(c: Candidate): Promise<number> {
  const path = c.onnxFile
    ? `${MODELS_DIR}/${c.onnxFile}`
    : `${CACHE_DIR}/${c.model}/onnx/${c.dtype === "q8" ? "model_quantized.onnx" : "model.onnx"}`;
  const exists = c.onnxFile
    ? true
    : (
        await readdir(`${CACHE_DIR}/${c.model}/onnx`).catch(
          () => [] as string[],
        )
      ).some((f) => path.endsWith(f));
  if (!exists) return -1;
  return Math.round(((await stat(path)).size / 1e6) * 10) / 10;
}

// ---- summarisers ------------------------------------------------------------

interface DetItem {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

function summariseDetections(items: DetItem[]): RawOutput {
  return {
    kind: "detection",
    detections: items.map((d) => ({
      label: d.label,
      score: Math.round(d.score * 1000) / 1000,
      box: { x0: d.box.xmin, y0: d.box.ymin, x1: d.box.xmax, y1: d.box.ymax },
    })),
  };
}

interface LogitsLike {
  dims: readonly number[];
  data: unknown;
}

/** Argmax at logit resolution, then majority class per grid cell. */
function summariseLogits(logits: LogitsLike, classes: string[]): RawOutput {
  const [, channels = 0, height = 0, width = 0] = logits.dims;
  const data = logits.data as Float32Array;
  const plane = height * width;
  const argmax = new Uint16Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0;
    let bestValue = -Infinity;
    for (let c = 0; c < channels; c++) {
      const v = data[c * plane + i] ?? -Infinity;
      if (v > bestValue) {
        bestValue = v;
        best = c;
      }
    }
    argmax[i] = best;
  }
  const grid: number[][] = [];
  for (let gy = 0; gy < GRID_H; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < GRID_W; gx++) {
      const counts = new Map<number, number>();
      const y0 = Math.floor((gy * height) / GRID_H);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / GRID_H));
      const x0 = Math.floor((gx * width) / GRID_W);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / GRID_W));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = argmax[y * width + x] ?? 0;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      let best = 0;
      let bestCount = -1;
      for (const [k, n] of counts) {
        if (n > bestCount) {
          best = k;
          bestCount = n;
        }
      }
      row.push(best);
    }
    grid.push(row);
  }
  return { kind: "segmentation", classes, grid };
}

/** Mean relative inverse depth per grid cell, min-max normalised per image. */
function summariseDepth(predicted: LogitsLike): RawOutput {
  const dims = predicted.dims;
  const height = dims[dims.length - 2] ?? 0;
  const width = dims[dims.length - 1] ?? 0;
  const data = predicted.data as Float32Array;
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const grid: number[][] = [];
  for (let gy = 0; gy < GRID_H; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < GRID_W; gx++) {
      const x0 = Math.floor((gx * width) / GRID_W);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / GRID_W));
      const y0 = Math.floor((gy * height) / GRID_H);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / GRID_H));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += data[y * width + x] ?? 0;
          n++;
        }
      }
      row.push(
        Math.round(((sum / Math.max(1, n) - min) / range) * 1000) / 1000,
      );
    }
    grid.push(row);
  }
  return { kind: "depth", grid };
}

// ---- loaders ----------------------------------------------------------------

/**
 * Spinning is disabled so idle sessions don't burn CPU while another model runs
 * (matters when several models share a process, as they would in a hybrid app).
 */
function sessionOptions(threads: number) {
  return {
    intraOpNumThreads: threads,
    interOpNumThreads: 1,
    extra: {
      session: {
        intra_op: { allow_spinning: "0" },
        inter_op: { allow_spinning: "0" },
      },
    },
  };
}

async function loadDetectionPipeline(
  c: Candidate,
  threads: number,
): Promise<Runner> {
  const detect = (await pipeline("object-detection", c.model, {
    device: "cpu",
    dtype: c.dtype,
    session_options: sessionOptions(threads),
  })) as unknown as (img: RawImage, options: object) => Promise<DetItem[]>;
  return {
    async run(img) {
      const t0 = performance.now();
      const raw = await detect(img, { threshold: 0.3, percentage: true });
      const t1 = performance.now();
      return {
        output: summariseDetections(raw),
        pre: 0,
        model: t1 - t0,
        post: 0,
        shape: [],
      };
    },
  };
}

async function loadOnnxSegmentation(
  c: Candidate,
  size: number,
  threads: number,
): Promise<Runner> {
  const session = await ort.InferenceSession.create(
    `${MODELS_DIR}/${c.onnxFile}`,
    sessionOptions(threads),
  );
  const classes = JSON.parse(
    await readFile(`${MODELS_DIR}/seaformer_classes.json`, "utf8"),
  ) as string[];
  return {
    async run(img) {
      const t0 = performance.now();
      const rgb = (await img.rgb().resize(size, size, { resample: 2 })).data;
      const plane = size * size;
      const input = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        for (let ch = 0; ch < 3; ch++) {
          input[ch * plane + i] =
            ((rgb[i * 3 + ch] ?? 0) - (MMSEG_MEAN[ch] ?? 0)) /
            (MMSEG_STD[ch] ?? 1);
        }
      }
      const tensor = new ort.Tensor("float32", input, [1, 3, size, size]);
      const t1 = performance.now();
      const result = await session.run({ pixel_values: tensor });
      const t2 = performance.now();
      const logits = result["logits"];
      if (!logits) throw new Error("no logits output");
      const output = summariseLogits(logits, classes);
      const t3 = performance.now();
      return {
        output,
        pre: t1 - t0,
        model: t2 - t1,
        post: t3 - t2,
        shape: [...tensor.dims],
      };
    },
  };
}

async function loadTransformersDirect(
  c: Candidate,
  size: number,
  threads: number,
): Promise<Runner> {
  const processor = await AutoImageProcessor.from_pretrained(c.model);
  processor.size = { width: size, height: size };
  const options = {
    device: "cpu" as const,
    dtype: c.dtype,
    session_options: sessionOptions(threads),
  };

  if (c.task === "image-segmentation") {
    const model = await AutoModelForSemanticSegmentation.from_pretrained(
      c.model,
      options,
    );
    const id2label = (
      model.config as unknown as { id2label: Record<string, string> }
    ).id2label;
    const classes = Object.keys(id2label)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => id2label[k] ?? k);
    return {
      async run(img) {
        const t0 = performance.now();
        const inputs = (await processor(img)) as { pixel_values: Tensor };
        const t1 = performance.now();
        const { logits } = (await model(inputs)) as { logits: Tensor };
        const t2 = performance.now();
        const output = summariseLogits(logits, classes);
        const t3 = performance.now();
        return {
          output,
          pre: t1 - t0,
          model: t2 - t1,
          post: t3 - t2,
          shape: inputs.pixel_values.dims,
        };
      },
    };
  }

  const model = await AutoModelForDepthEstimation.from_pretrained(
    c.model,
    options,
  );
  return {
    async run(img) {
      const t0 = performance.now();
      const inputs = (await processor(img)) as { pixel_values: Tensor };
      const t1 = performance.now();
      const { predicted_depth } = (await model(inputs)) as {
        predicted_depth: Tensor;
      };
      const t2 = performance.now();
      const output = summariseDepth(predicted_depth);
      const t3 = performance.now();
      return {
        output,
        pre: t1 - t0,
        model: t2 - t1,
        post: t3 - t2,
        shape: inputs.pixel_values.dims,
      };
    },
  };
}

export async function loadRunner(
  c: Candidate,
  threads: number,
): Promise<Runner> {
  if (c.task === "object-detection") return loadDetectionPipeline(c, threads);
  if (!c.inputSize)
    throw new Error(`${c.key}: segmentation/depth candidates need inputSize`);
  if (c.onnxFile) return loadOnnxSegmentation(c, c.inputSize, threads);
  return loadTransformersDirect(c, c.inputSize, threads);
}
