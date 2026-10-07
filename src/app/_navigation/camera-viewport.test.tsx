import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CAMERA_STATES, type CameraError, type CameraState } from "@/camera";
import { CameraViewport } from "./camera-viewport";
import { cameraMessage, cameraStatusLabel } from "./camera-status";

const denied: CameraError = {
  kind: "permission_denied",
  message: "Camera permission was denied.",
  retryable: true,
};

function setup(
  state: CameraState,
  extra: Partial<Parameters<typeof CameraViewport>[0]> = {},
) {
  const props = {
    state,
    error: null,
    videoRef: vi.fn(),
    canSwitch: false,
    switching: false,
    onStart: vi.fn(),
    onSwitch: vi.fn(),
    ...extra,
  };
  render(<CameraViewport {...props} />);
  return props;
}

describe("CameraViewport", () => {
  it("offers to start when the camera is off", async () => {
    const { onStart } = setup("idle");
    expect(screen.getByText("Camera is off.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start camera" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("explains the permission prompt without offering a button", () => {
    setup("requesting_permission");
    expect(
      screen.getByText("Waiting for camera permission…"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the denied message, an honest hint, and a retry button", async () => {
    const { onStart } = setup("error", { error: denied });
    expect(screen.getByText(denied.message)).toBeInTheDocument();
    expect(
      screen.getByText("Guidance is not available without the camera."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Try camera again" }),
    );
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("does not offer retry for a non-retryable error", () => {
    setup("error", { error: { ...denied, retryable: false } });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the unsupported-browser fallback with no retry", () => {
    setup("unsupported", {
      error: {
        kind: "unsupported",
        message: "This browser cannot access a camera here.",
        retryable: false,
      },
    });
    expect(
      screen.getByText("This browser cannot access a camera here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows paused text instead of a black frame", () => {
    setup("paused");
    expect(screen.getByText("Camera paused.")).toBeInTheDocument();
  });

  it("shows the preview and a switch control when active with several cameras", async () => {
    const { onSwitch } = setup("active", { canSwitch: true });
    const region = screen.getByRole("region", { name: "Camera view" });
    const video = region.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).not.toHaveAttribute("hidden");
    expect(video).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Switch camera" }),
    );
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("hides the switch control with a single camera and hides the video when inactive", () => {
    setup("active");
    expect(
      screen.queryByRole("button", { name: "Switch camera" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the video element mounted (hidden) while inactive so the ref persists", () => {
    const { videoRef } = setup("idle");
    expect(videoRef).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
    expect(
      screen
        .getByRole("region", { name: "Camera view" })
        .querySelector("video"),
    ).toHaveAttribute("hidden");
  });

  it("keeps a persistent polite live region for status changes", () => {
    setup("idle");
    expect(
      document.querySelector(".camera-viewport__text[aria-live='polite']"),
    ).not.toBeNull();
  });
});

describe("camera status text", () => {
  it("covers every state and never claims the path is clear", () => {
    for (const state of CAMERA_STATES) {
      expect(cameraStatusLabel(state)).not.toBe("");
      expect(cameraMessage(state, null).toLowerCase()).not.toContain("clear");
    }
    expect(cameraMessage("active", null)).toBe("");
  });
});
