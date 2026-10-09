# Capabilities — `src/capabilities/`

Detects browser and device capabilities at runtime, providing the UI with a
structured view of what the current environment supports.

## Capabilities detected

| Capability      | What it checks                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **Camera**      | `getUserMedia`, camera permission state, video input devices                                    |
| **Location**    | `navigator.geolocation`, permission state                                                      |
| **Speech**      | `speechSynthesis`, available voices                                                             |
| **Microphone**  | `SpeechRecognition` / `webkitSpeechRecognition`, microphone permission                         |
| **Orientation** | `AbsoluteOrientationSensor` / `RelativeOrientationSensor` / `DeviceOrientationEvent`           |
| **Local perception** | WebGPU / WebAssembly support **and** whether model weights are actually installed (they do not ship with the app) |

## States

- `checking` — detection in progress
- `available` — capability is ready to use
- `unavailable` — not supported by this browser/device
- `denied` — user has denied the required permission
- `prompt` — permission has not been requested yet

## Usage

```tsx
import { useCapabilities } from "@/capabilities";

function MyComponent() {
  const caps = useCapabilities();
  // caps.camera.state === "available" | "unavailable" | "denied" | ...
}
```

The hook re-detects when permission states change (via the Permissions API
`change` event where supported).
