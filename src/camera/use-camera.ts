"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { CameraController, INITIAL_CAMERA_SNAPSHOT } from "./controller";
import { FrameCapture } from "./frame-capture";

const getServerSnapshot = () => INITIAL_CAMERA_SNAPSHOT;

/**
 * React binding for `CameraController`. The camera is released when the
 * component unmounts; call `start()` (e.g. in an effect) to begin.
 */
export function useCamera() {
  const [controller] = useState(() => new CameraController());
  const [frameCapture] = useState(
    () => new FrameCapture(() => controller.getActiveVideo()),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    getServerSnapshot,
  );

  // `stop` is idempotent and `start` re-runs after it, so this is StrictMode-safe.
  useEffect(() => () => controller.stop(), [controller]);

  const videoRef = useCallback(
    (element: HTMLVideoElement | null) => controller.attachVideo(element),
    [controller],
  );

  const actions = useMemo(
    () => ({
      start: () => controller.start(),
      stop: () => controller.stop(),
      pause: () => controller.pause(),
      resume: () => controller.resume(),
      switchCamera: () => controller.switchCamera(),
    }),
    [controller],
  );

  return {
    ...snapshot,
    ...actions,
    videoRef,
    captureFrame: frameCapture.captureFrame,
  };
}

export type UseCamera = ReturnType<typeof useCamera>;
