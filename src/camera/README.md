# `camera/` — browser camera subsystem

Client-only input layer: owns the camera stream, captures frames on demand, and
schedules capture. It does **not** know about AI, GPS, safety, or UI. Browser
code only — never import it from a route handler.

| File                              | Role                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `state.ts`                        | Pure state machine: `idle`, `requesting_permission`, `active`, `paused`, `error`, `unsupported` |
| `controller.ts`                   | `CameraController`: stream lifecycle, pause reasons, switching, cleanup        |
| `errors.ts`                       | Classifies untrusted `getUserMedia` rejections into stable `CameraError`s      |
| `frame-capture.ts`                | `FrameCapture.captureFrame({ maxWidth, maxHeight, quality })` → `Blob`         |
| `frame-scheduler.ts`              | `FrameScheduler`: start / stop / pause / resume, no overlap, abortable. `intervalMs` also accepts a function, so a consumer can pace itself against measured cost (used by the Phase-14 local loop) |
| `frame-consumer.ts`               | `FrameConsumer` interface + dev-only metadata logger                           |
| `use-camera.ts`, `use-frame-loop.ts` | React bindings                                                              |
| `config.ts`                       | Defaults and limits (1000 ms, 1024 px box, JPEG 0.7)                           |

## Usage

```tsx
const camera = useCamera();            // state, error, canSwitch, videoRef, actions
useEffect(() => { void camera.start(); }, [camera.start]);
useFrameLoop({
  enabled: camera.state === "active",
  captureFrame: camera.captureFrame,
  consumer: myConsumer,                // FrameConsumer
  intervalMs: 1000,                    // override defaults here, not in UI
});
return <video ref={camera.videoRef} muted playsInline autoPlay />;
```

The camera is released when the component unmounts. `start()` after `stop()` is
safe (React StrictMode double-mounts in dev).

## Guarantees

- Tracks are stopped on `stop()`, unmount, failure, device loss, switch, and if
  a `getUserMedia` promise resolves after `stop()`.
- Scheduler jobs never overlap; pause/stop/hidden tab abort the in-flight
  signal **and** discard its result even if capture ignores the signal.
- Frames are in-memory `Blob`s for one consumer call. No base64, web storage,
  IndexedDB, or network. The dev consumer logs metadata only.
- Pause reasons (user PAUSE, tab hidden) are independent: the camera resumes
  only when all are cleared.

## Browser limitations

- **Secure context required.** `navigator.mediaDevices` is `undefined` on plain
  HTTP (except `localhost`) and in some embedded webviews → `unsupported`.
- **Permission UX differs.** Chrome/Edge remember the choice; Safari/iOS and
  Firefox may re-prompt each visit or session. A denied prompt cannot be
  re-shown from code — the user must change the site setting, then retry. The
  `permission_denied` message says so.
- **`facingMode: { ideal: "environment" }` is a hint.** Desktops fall back to
  the only camera; if constraints are rejected we retry with plain `video: true`.
- **Switching** cycles `videoinput` devices (`canSwitch` needs ≥ 2). Device
  labels/ids are only reliable after permission is granted. Many mobile
  browsers can't open two cameras at once, so the old track is released first;
  if the new camera fails we try to reopen the previous one.
- **Pause disables tracks, it doesn't release them.** Some browsers keep the
  camera indicator on while a track is disabled; `stop()` always turns it off.
- **Background tabs.** Browsers (notably mobile Safari/Chrome) may mute or
  end camera tracks when hidden and `video.play()` may need a gesture on
  resume. We pause on `visibilitychange`; a track that actually ends becomes
  `device_lost` (retryable).
- **Autoplay.** Video is `muted` + `playsInline` so autoplay is allowed; if
  `play()` is still refused the stream stays attached and the error is ignored.
- **Screen off / lock** on mobile stops the camera regardless of the app.
- **Frame timing.** Capture uses a canvas and `setTimeout`; timers are
  throttled in background tabs (we pause there anyway) and drift under CPU
  load — the interval is a floor between jobs, not a guarantee. `toBlob` JPEG
  size/time varies by device.
- **Not hardware-tested.** Tests use fakes and a canvas-backed mock stream; real
  camera behaviour across iOS Safari, Android Chrome, and Firefox is unverified.

## CameraSource abstraction (Phase 15)

Phase 15 adds a source-agnostic interface so the perception pipeline does not
care whether frames come from a browser `getUserMedia`, a USB camera, or a CSI
sensor on a Raspberry Pi or Jetson.

| File                         | Role |
| ---------------------------- | ---- |
| `source.ts`                  | `CameraSource` interface, `CameraFrame` Zod schema, `CameraSourceSnapshot` |
| `browser-camera-source.ts`   | `BrowserCameraSource` — adapts `CameraController` + `FrameCapture` to `CameraSource` |

### CameraFrame

```ts
CameraFrame {
  id: number            // monotonic per source
  timestamp: number     // Date.now() at pixel read
  width: number
  height: number
  orientation: "landscape" | "portrait" | "unknown"
  source: "browser" | "mobile" | "external" | "fixture" | "unknown"
  data: Blob            // encoded pixels
}
```

No `MediaStream`, `HTMLVideoElement`, or other browser objects leak past the
source adapter. The perception pipeline, safety engine, and speech engine see
only `CameraFrame`.

### Future sources (planned, not implemented)

- `MobileCameraSource` — React Native / Capacitor bridge
- `ExternalCameraSource` — WebUSB, WebSocket relay, or native bridge

See [`docs/hardware-roadmap.md`](../../docs/hardware-roadmap.md) for the
hardware evaluation.
