# PWA & Mobile — Reference

Added in Phase 12. This document covers the installable PWA, capability
detection, mobile UI behaviour, and known platform limitations.

---

## PWA installability

The app is a Progressive Web App with:

| Feature            | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Manifest**       | `/public/manifest.json`                              |
| **Service worker** | `/public/sw.js` — network-first with shell cache     |
| **Display**        | `standalone`                                         |
| **Orientation**    | `any` (portrait and landscape both supported)        |
| **Theme color**    | Dark `#0b0b0c` / Light `#ffffff` (media query)       |
| **Icons**          | SVG (any size), PNG 192×192, PNG 512×512             |
| **Apple**          | `apple-touch-icon.png` (180×180), `apple-mobile-web-app-capable` |
| **Install prompt** | Captured via `beforeinstallprompt` on the home page  |

### How to install

- **Android Chrome**: Menu → "Install app" or the in-app install button.
- **iOS Safari**: Share → "Add to Home Screen" (no `beforeinstallprompt` on iOS;
  the install button is hidden and the user must use the share sheet).
- **Desktop Chrome/Edge**: Address-bar install icon or the in-app install button.

---

## Capability detection layer

`src/capabilities/` detects five device/browser capabilities at runtime and
exposes them to the UI via `useCapabilities()`. The home page shows a
"Device capabilities" panel summarising the results.

| Capability      | API probed                                                         |
| --------------- | ------------------------------------------------------------------ |
| Camera          | `navigator.mediaDevices.getUserMedia`, `enumerateDevices`          |
| Location        | `navigator.geolocation`, Permissions API                           |
| Speech output   | `window.speechSynthesis`, `getVoices()`                            |
| Voice input     | `SpeechRecognition` / `webkitSpeechRecognition`, mic permission    |
| Orientation     | `AbsoluteOrientationSensor` / `DeviceOrientationEvent`             |

States: `checking` → `available` | `unavailable` | `denied` | `prompt`.

The hook re-checks when a permission state changes (Permissions API `change`
event, where the browser supports it).

---

## Browser support matrix

### Supported (tested)

| Browser             | Camera | Location | Speech out | Voice in | Orientation | Install |
| ------------------- | ------ | -------- | ---------- | -------- | ----------- | ------- |
| **Android Chrome**  | ✅      | ✅        | ✅          | ✅        | ✅           | ✅       |
| **Desktop Chrome**  | ✅      | ✅        | ✅          | ✅        | ❌           | ✅       |
| **Desktop Edge**    | ✅      | ✅        | ✅          | ✅        | ❌           | ✅       |

### Partially supported

| Browser               | Notes                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **iOS Safari (17+)**  | Camera: ✅. Location: ✅. Speech: ✅ (may pause on screen lock). Voice in: ❌ (no `SpeechRecognition`). Orientation: requires `DeviceOrientationEvent.requestPermission()`. Install: Add-to-Home-Screen only, no `beforeinstallprompt`. |
| **Android Firefox**   | Camera: ✅. Location: ✅. Speech: ✅ (limited voices). Voice in: ❌ (no `SpeechRecognition`). Orientation: ✅ (`DeviceOrientationEvent`). Install: ❌ (no PWA install support). |
| **Desktop Firefox**   | Camera: ✅. Location: ✅. Speech: ✅. Voice in: ❌. Orientation: ❌. Install: ❌. |
| **Desktop Safari**    | Camera: ✅. Speech: ✅. Voice in: ❌. Install: ❌.                                        |

### Not supported

| Browser       | Reason                                            |
| ------------- | ------------------------------------------------- |
| IE 11         | No `getUserMedia`, no service worker, no ES2022.  |
| Opera Mini    | No `getUserMedia`, no service worker.             |
| UC Browser    | Unpredictable `getUserMedia` and speech support.  |

---

## Permissions required

| Permission     | When requested                        | Fallback if denied                        |
| -------------- | ------------------------------------- | ----------------------------------------- |
| **Camera**     | On "Start camera" tap                 | No live analysis; manual text queries only |
| **Location**   | On session start (navigate mode)      | No GPS routing; heading unavailable        |
| **Microphone** | On "Voice" button tap (explore mode)  | Text input available as fallback           |

Camera requires HTTPS (or `localhost`).

---

## Known limitations & platform-specific behaviour

### Camera

- **iOS Safari**: Opening the camera in standalone (PWA) mode works but the
  initial permission prompt may appear behind the app. Switching back to Safari
  settings and re-opening resolves this.
- **Android**: Some devices only expose one camera to `enumerateDevices` even
  when front and back cameras exist. The "Switch camera" button appears only
  when multiple devices are reported.
- **Firefox mobile**: `facingMode` constraint is respected but `enumerateDevices`
  may return empty labels until permission is granted.

### SpeechSynthesis

- **iOS Safari**: `speechSynthesis.speak()` is blocked until a user gesture.
  The first interaction (start session) satisfies this. Speech may be
  interrupted or silenced when the screen locks — iOS pauses the web audio
  context. There is no reliable workaround from a web page.
- **Android Chrome**: Reliable. Works in background and with screen off as long
  as the tab is active.
- **Firefox**: Fewer voices available. `speechSynthesis.cancel()` may leave the
  synthesis in a stuck state on some versions — the engine retries once on
  error.
- **Autoplay restrictions**: All browsers require a user gesture before the
  first `speak()` call. The session-start interaction satisfies this.

### Audio interruption & screen lock

- **iOS**: Screen lock pauses all web audio. Speech stops. On unlock the app
  resumes but does not replay missed announcements (by design — stale safety
  instructions could be dangerous).
- **Android**: Chrome continues speech even when the screen is off if the tab
  has focus. Firefox may silence speech on screen off depending on power-save
  settings.
- **Headphone disconnect**: No API to detect this from a web page. Speech
  output switches to the device speaker automatically.

### Location

- **GPS cold start**: First position may take 10–30 seconds. The app shows
  "Acquiring location…" during this period.
- **Indoor accuracy**: GPS may be inaccurate indoors. The safety engine treats
  high-error readings as degraded, not absent.

### Orientation

- **iOS 13+**: `DeviceOrientationEvent.requestPermission()` must be called from
  a user gesture. The capability detector reports `prompt` in this case.
- **Desktop**: Orientation sensors are typically unavailable. The capability
  status shows "Unsupported".

### Service worker

- The service worker uses a network-first strategy. If the network is
  unreachable, the cached shell pages are served. API calls (`/api/*`) are
  never cached — they require the server.
- Updates to the service worker take effect on the next page load after the new
  worker activates.

---

## Mobile UI design decisions

- **STOP button**: Full-width and placed first (visually top of control group)
  on narrow portrait screens (≤ 480 px). Minimum 80 px tall with 1.75 rem
  font. Always reachable with one hand.
- **Touch targets**: All interactive elements are ≥ 44 px (WCAG) via
  `--touch-min`. Control buttons are ≥ 64 px, STOP is ≥ 72 px (≥ 80 px on
  small phones).
- **Accidental-touch prevention**: `touch-action: manipulation` on all buttons
  prevents double-tap zoom. Generous gap (1 rem) between session controls.
- **Safe-area insets**: Bottom controls include `env(safe-area-inset-bottom)`
  for devices with home indicator / gesture bars.
- **Screen brightness**: Light-theme STOP button has a box-shadow for
  visibility in bright outdoor conditions.
- **Viewport**: `viewport-fit=cover` for edge-to-edge PWA on notched devices.
  User zoom remains enabled (max scale 5) per accessibility requirements.
