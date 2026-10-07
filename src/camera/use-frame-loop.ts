"use client";

import { useEffect, useRef } from "react";
import { FRAME_CAPTURE_DEFAULTS } from "./config";
import type { CapturedFrame, FrameCaptureCallOptions } from "./frame-capture";
import type { FrameConsumer } from "./frame-consumer";
import { FrameScheduler } from "./frame-scheduler";

export interface UseFrameLoopOptions {
  /** Capture only runs while true (e.g. camera is active and enabled). */
  enabled: boolean;
  captureFrame: (options?: FrameCaptureCallOptions) => Promise<CapturedFrame>;
  consumer: FrameConsumer;
  intervalMs?: number;
  captureOptions?: Omit<FrameCaptureCallOptions, "signal">;
  onError?: (error: unknown) => void;
}

/**
 * Runs a `FrameScheduler` while `enabled`, feeding frames to `consumer`. The
 * scheduler is torn down (aborting any in-flight capture) when `enabled`
 * flips off or the component unmounts.
 */
export function useFrameLoop({
  enabled,
  captureFrame,
  consumer,
  intervalMs = FRAME_CAPTURE_DEFAULTS.intervalMs,
  captureOptions,
  onError,
}: UseFrameLoopOptions): void {
  // Latest values without restarting the loop on every render.
  const latest = useRef({ consumer, captureOptions, onError });
  useEffect(() => {
    latest.current = { consumer, captureOptions, onError };
  });

  useEffect(() => {
    if (!enabled) return;
    const scheduler = new FrameScheduler<CapturedFrame>({
      intervalMs,
      capture: (signal) =>
        captureFrame({ ...latest.current.captureOptions, signal }),
      onFrame: (frame) => latest.current.consumer.consume(frame),
      onError: (error) => latest.current.onError?.(error),
    });
    scheduler.start();
    return () => scheduler.stop();
  }, [enabled, captureFrame, intervalMs]);
}
