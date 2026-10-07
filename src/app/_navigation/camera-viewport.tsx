import type { ReactNode } from "react";

/**
 * Placeholder for the live camera. Keeps a fixed aspect ratio (see
 * `.camera-viewport` CSS) so swapping in a real `<video>` later won't reflow.
 */
export function CameraViewport({ children }: { children?: ReactNode }) {
  return (
    <section className="camera-viewport" aria-label="Camera view">
      <p className="camera-viewport__placeholder">
        Camera not connected.
        <br />
        Live video will appear here.
      </p>
      {children}
    </section>
  );
}
