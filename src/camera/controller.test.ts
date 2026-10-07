import { describe, expect, it, vi } from "vitest";
import { CameraController } from "./controller";
import {
  deferred,
  domError,
  fakeStream,
  fakeVideo,
  fakeVisibility,
  FakeTrack,
} from "./test-helpers";

function setup(
  options: {
    getUserMedia?: ReturnType<typeof vi.fn>;
    devices?: string[];
  } = {},
) {
  const first = fakeStream({ deviceId: "cam-a", facingMode: "environment" });
  const getUserMedia =
    options.getUserMedia ?? vi.fn(() => Promise.resolve(first.stream));
  const ids = options.devices ?? ["cam-a"];
  const mediaDevices = {
    getUserMedia,
    enumerateDevices: vi.fn(() =>
      Promise.resolve(
        ids.map((deviceId) => ({ kind: "videoinput", deviceId })),
      ),
    ),
  } as unknown as MediaDevices;
  const visibility = fakeVisibility();
  const controller = new CameraController({
    mediaDevices,
    visibility: visibility.source,
  });
  const states: string[] = [];
  controller.subscribe(() => states.push(controller.getSnapshot().state));
  return { controller, first, getUserMedia, visibility, states };
}

describe("CameraController lifecycle", () => {
  it("requests the environment camera without audio and becomes active", async () => {
    const { controller, getUserMedia, states } = setup();
    await controller.start();

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({
          facingMode: { ideal: "environment" },
        }),
      }),
    );
    expect(states).toEqual(["requesting_permission", "active"]);
    expect(controller.getSnapshot().facing).toBe("environment");
  });

  it("is unsupported when mediaDevices is missing", async () => {
    const controller = new CameraController({ mediaDevices: undefined });
    await controller.start();
    const snapshot = controller.getSnapshot();
    expect(snapshot.state).toBe("unsupported");
    expect(snapshot.error?.kind).toBe("unsupported");
  });

  it.each([
    ["NotAllowedError", "permission_denied"],
    ["NotFoundError", "no_camera"],
    ["NotReadableError", "camera_in_use"],
    ["SecurityError", "blocked"],
    ["WeirdError", "unknown"],
  ])("maps %s to error kind %s", async (name, kind) => {
    const { controller } = setup({
      getUserMedia: vi.fn(() => Promise.reject(domError(name))),
    });
    await controller.start();
    expect(controller.getSnapshot().state).toBe("error");
    expect(controller.getSnapshot().error?.kind).toBe(kind);
  });

  it("retries with unconstrained video when constraints are rejected", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("OverconstrainedError"))
      .mockResolvedValueOnce(stream);
    const { controller } = setup({ getUserMedia });
    await controller.start();
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: true,
    });
    expect(controller.getSnapshot().state).toBe("active");
  });

  it("can retry after an error", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(domError("NotAllowedError"))
      .mockResolvedValueOnce(stream);
    const { controller } = setup({ getUserMedia });
    await controller.start();
    await controller.start();
    expect(controller.getSnapshot().state).toBe("active");
    expect(controller.getSnapshot().error).toBeNull();
  });

  it("ignores start() while already requesting or active", async () => {
    const { controller, getUserMedia } = setup();
    await Promise.all([controller.start(), controller.start()]);
    await controller.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("stop() releases every track and returns to idle", async () => {
    const { controller, first } = setup();
    const video = fakeVideo();
    controller.attachVideo(video);
    await controller.start();
    expect(video.srcObject).toBe(first.stream);

    controller.stop();
    expect(first.track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(controller.getSnapshot().state).toBe("idle");
  });

  it("releases a stream that arrives after stop() (no leaked tracks)", async () => {
    const pending = deferred<MediaStream>();
    const { controller, first } = setup({
      getUserMedia: vi.fn(() => pending.promise),
    });
    const started = controller.start();
    controller.stop();
    pending.resolve(first.stream);
    await started;

    expect(first.track.stop).toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe("idle");
  });

  it("does not let a stale failure overwrite a newer session", async () => {
    const stale = deferred<MediaStream>();
    const fresh = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(fresh.stream);
    const { controller } = setup({ getUserMedia });
    const first = controller.start();
    controller.stop();
    await controller.start();
    stale.reject(domError("NotAllowedError"));
    await first;
    expect(controller.getSnapshot().state).toBe("active");
  });

  it("moves to error and releases tracks when the device disappears", async () => {
    const { controller, first } = setup();
    await controller.start();
    first.track.end();
    expect(controller.getSnapshot().state).toBe("error");
    expect(controller.getSnapshot().error?.kind).toBe("device_lost");
    expect(first.track.stop).toHaveBeenCalled();
  });

  it("stops watching visibility after stop()", async () => {
    const { controller, visibility } = setup();
    await controller.start();
    expect(visibility.listenerCount()).toBe(1);
    controller.stop();
    expect(visibility.listenerCount()).toBe(0);
  });
});

describe("CameraController pause / visibility", () => {
  it("pause disables tracks and resume re-enables them", async () => {
    const { controller, first } = setup();
    const video = fakeVideo();
    controller.attachVideo(video);
    await controller.start();

    controller.pause();
    expect(controller.getSnapshot().state).toBe("paused");
    expect(first.track.enabled).toBe(false);
    expect(video.pause).toHaveBeenCalled();
    expect(controller.getActiveVideo()).toBeNull();

    controller.resume();
    expect(controller.getSnapshot().state).toBe("active");
    expect(first.track.enabled).toBe(true);
    expect(controller.getActiveVideo()).toBe(video);
  });

  it("pauses when the tab is hidden and resumes when visible", async () => {
    const { controller, visibility } = setup();
    await controller.start();
    visibility.setHidden(true);
    expect(controller.getSnapshot().state).toBe("paused");
    visibility.setHidden(false);
    expect(controller.getSnapshot().state).toBe("active");
  });

  it("stays paused until every reason clears", async () => {
    const { controller, visibility } = setup();
    await controller.start();
    controller.pause();
    visibility.setHidden(true);
    visibility.setHidden(false);
    expect(controller.getSnapshot().state).toBe("paused");
    controller.resume();
    expect(controller.getSnapshot().state).toBe("active");
  });

  it("starts paused if the tab is hidden when permission is granted", async () => {
    const { controller, visibility, first } = setup();
    visibility.setHidden(true);
    await controller.start();
    expect(controller.getSnapshot().state).toBe("paused");
    expect(first.track.enabled).toBe(false);
  });

  it("honours a pause requested during the permission prompt", async () => {
    const pending = deferred<MediaStream>();
    const { controller, first } = setup({
      getUserMedia: vi.fn(() => pending.promise),
    });
    const started = controller.start();
    controller.pause();
    pending.resolve(first.stream);
    await started;
    expect(controller.getSnapshot().state).toBe("paused");
  });

  it("ignores pause/resume when not started", () => {
    const { controller } = setup();
    controller.pause();
    controller.resume();
    expect(controller.getSnapshot().state).toBe("idle");
  });
});

describe("CameraController switching", () => {
  it("reports canSwitch only with more than one camera", async () => {
    const single = setup();
    await single.controller.start();
    expect(single.controller.getSnapshot().canSwitch).toBe(false);
    expect(await single.controller.switchCamera()).toBe(false);

    const multi = setup({ devices: ["cam-a", "cam-b"] });
    await multi.controller.start();
    expect(multi.controller.getSnapshot().canSwitch).toBe(true);
  });

  it("releases the old track and opens the next device", async () => {
    const second = fakeStream({ deviceId: "cam-b", facingMode: "user" });
    const { controller, first, getUserMedia } = setup({
      devices: ["cam-a", "cam-b"],
    });
    getUserMedia.mockResolvedValueOnce(first.stream);
    getUserMedia.mockResolvedValueOnce(second.stream);
    await controller.start();

    expect(await controller.switchCamera()).toBe(true);
    expect(getUserMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: "cam-b" } }),
      }),
    );
    expect(first.track.stop).toHaveBeenCalled();
    expect(controller.getSnapshot().facing).toBe("user");
    expect(controller.getSnapshot().state).toBe("active");
    expect(controller.getSnapshot().switching).toBe(false);
  });

  it("falls back to the previous camera if the switch fails", async () => {
    const restored = fakeStream({ deviceId: "cam-a" });
    const { controller, first, getUserMedia } = setup({
      devices: ["cam-a", "cam-b"],
    });
    getUserMedia.mockResolvedValueOnce(first.stream);
    getUserMedia.mockRejectedValueOnce(domError("NotReadableError"));
    getUserMedia.mockResolvedValueOnce(restored.stream);
    await controller.start();

    expect(await controller.switchCamera()).toBe(false);
    expect(controller.getSnapshot().state).toBe("active");
    controller.stop();
    expect(restored.track.stop).toHaveBeenCalled();
  });

  it("errors out if neither the new nor the old camera can be opened", async () => {
    const { controller, first, getUserMedia } = setup({
      devices: ["cam-a", "cam-b"],
    });
    getUserMedia.mockResolvedValueOnce(first.stream);
    getUserMedia.mockRejectedValue(domError("NotReadableError"));
    await controller.start();
    await controller.switchCamera();
    expect(controller.getSnapshot().state).toBe("error");
  });

  it("releases a stream opened for a switch that was cancelled by stop()", async () => {
    const pending = deferred<MediaStream>();
    const late = fakeStream({ deviceId: "cam-b" });
    const { controller, first, getUserMedia } = setup({
      devices: ["cam-a", "cam-b"],
    });
    getUserMedia.mockResolvedValueOnce(first.stream);
    getUserMedia.mockReturnValueOnce(pending.promise);
    await controller.start();

    const switching = controller.switchCamera();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    controller.stop();
    pending.resolve(late.stream);
    await switching;

    expect(late.track.stop).toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe("idle");
  });
});

it("FakeTrack sanity: unplug listener removed on stop", async () => {
  const { controller, first } = setup();
  await controller.start();
  controller.stop();
  expect(first.track).toBeInstanceOf(FakeTrack);
  first.track.end();
  expect(controller.getSnapshot().state).toBe("idle");
});
