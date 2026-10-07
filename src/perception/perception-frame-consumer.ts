import type { CapturedFrame, FrameConsumer } from "@/camera";
import { blobToDataUrl } from "./analysis-client";
import type { PerceptionController } from "./perception-controller";

export interface PerceptionFrameConsumerOptions {
  controller: PerceptionController;
  /** Encode the frame to a data URL; injectable for tests. */
  encode?: (blob: Blob) => Promise<string>;
  onError?: (error: unknown) => void;
}

/**
 * Bridges the camera's `FrameConsumer` seam to the perception pipeline: each
 * captured frame is encoded to a transient data URL and submitted to the
 * {@link PerceptionController}, which throttles to one request in flight. The
 * frame blob is never stored; it is dropped as soon as encoding returns.
 */
export function createPerceptionFrameConsumer(
  options: PerceptionFrameConsumerOptions,
): FrameConsumer {
  const encode = options.encode ?? blobToDataUrl;
  return {
    async consume(frame: CapturedFrame): Promise<void> {
      let dataUrl: string;
      try {
        dataUrl = await encode(frame.blob);
      } catch (error) {
        options.onError?.(error);
        return;
      }
      options.controller.submit({
        dataUrl,
        capturedAt: frame.capturedAt,
        width: frame.width,
        height: frame.height,
      });
    },
  };
}
