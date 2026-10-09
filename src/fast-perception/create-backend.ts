/**
 * Lazy entry point for local inference.
 *
 * The dynamic import is the point: `onnxruntime-web` and its WASM artifacts are
 * only fetched when a session actually enables local perception, so a cloud-only
 * build never pays for them.
 */
import type { LocalVisionBackend } from "./backend";
import type { OnnxBackendOptions } from "./onnx-backend";

export async function createOnnxBackend(
  options: OnnxBackendOptions = {},
): Promise<LocalVisionBackend> {
  const { OnnxVisionBackend } = await import("./onnx-backend");
  return OnnxVisionBackend.create(options);
}

export type { OnnxBackendOptions };
