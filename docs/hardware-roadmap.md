# Hardware Roadmap

Status: **planning only — no hardware decision made**. This document evaluates
future hardware options for a vest-mounted camera and documents how each would
connect to the existing software layers. Nothing here should be built before the
software prototype is verified on real phones (Phase 12/14 real-device
verification).

---

## 1. CameraSource abstraction

Phase 15 introduced a source-agnostic interface:

```
CameraSource
 ├── BrowserCameraSource  (implemented — browser getUserMedia)
 ├── MobileCameraSource   (future — React Native / Capacitor bridge)
 └── ExternalCameraSource (future — WebUSB, WebSocket relay, or native bridge)
```

Every consumer — cloud perception, local fast-perception, safety engine, speech
engine — sees only the normalized `CameraFrame`:

```
CameraFrame {
  id: number          — monotonic per source
  timestamp: number   — Date.now() at pixel read
  width: number
  height: number
  orientation: "landscape" | "portrait" | "unknown"
  source: "browser" | "mobile" | "external" | "fixture" | "unknown"
  data: Blob          — encoded pixels (JPEG/WebP/PNG)
}
```

Browser-specific objects (`MediaStream`, `HTMLVideoElement`,
`getUserMedia` constraints) are confined to `BrowserCameraSource` and never leak
to the perception pipeline or any higher layer.

---

## 2. Hardware options

### Option A: Phone mounted on vest

The user's own phone, secured to the chest with a clip or pouch.

| Criterion        | Assessment |
|------------------|------------|
| Latency          | **Low.** Camera and compute are co-located. No frame transport cost. |
| Battery          | **Medium.** Continuous camera + inference drains fast; 2–4 h realistic with a 5000 mAh phone. External power bank extends it. |
| Weight           | **Very low.** ~180–220 g phone + ~50 g mount. |
| Heat             | **Medium.** Sustained GPU/NPU use will thermally throttle mid-tier SoCs. Top-tier phones (Tensor G4, Snapdragon 8 Gen 3, A17) handle it better. |
| Compute          | **Good.** Mid-range to flagship phones can run SeaFormer-S at 5–15 FPS via GPU/NPU delegates. |
| Camera quality   | **Good.** Modern phone cameras (12–50 MP, OIS, HDR) are well above minimum requirements. |
| Network          | **Built in.** LTE/5G for cloud perception; Wi-Fi when available. |
| Cost             | **Very low.** User's existing phone + $10–30 vest mount. |
| Maintainability  | **Excellent.** OS updates, app store delivery. User already knows the device. |

**Pros:** Lowest barrier to entry. No additional hardware to charge/pair/maintain.
Maximises camera quality. Full network stack.

**Cons:** Awkward field of view when chest-mounted (downward angle requires
calibration). User loses their phone for other tasks. Thermal throttling under
sustained load.

### Option B: Phone + external USB camera

The user carries their phone (in pocket or arm), with a small USB-C/OTG camera
clipped to the vest at chest or shoulder height.

| Criterion        | Assessment |
|------------------|------------|
| Latency          | **Low-medium.** USB UVC adds ~10–30 ms per frame. Decode is on the phone. |
| Battery          | **Medium.** Camera draws ~200–500 mW from the phone. Similar overall to Option A. |
| Weight           | **Low.** Phone + ~30–80 g USB camera + cable. |
| Heat             | **Medium.** Same compute on the phone; the external camera itself runs cool. |
| Compute          | **Good.** Same as Option A — the phone does all processing. |
| Camera quality   | **Variable.** Cheap USB cameras are 720p/fixed-focus; good ones (e.g. IMX219 USB modules) approach phone quality. |
| Network          | **Built in.** Same as Option A. |
| Cost             | **Low.** $15–60 USB camera module + phone. |
| Maintainability  | **Good.** One more cable/device to charge, but the compute side stays phone-managed. |

**Pros:** Better field-of-view control (camera aims forward while phone stays
accessible). Phone available for audio and other use.

**Cons:** Extra cable and device. USB UVC support varies by Android OEM. Camera
quality ceiling lower than the phone's own sensor. Requires Android
`UsbManager` permissions and an `ExternalCameraSource` adapter that reads UVC
frames.

### Option C: Raspberry Pi (Zero 2 W / 4 / 5)

A dedicated SBC on the vest running the perception stack natively or streaming
frames to the phone.

| Criterion        | Assessment |
|------------------|------------|
| Latency          | **Medium.** Pi 5 can run SeaFormer-S at ~2–5 FPS in ONNX/CPU. Pi Zero 2 is too slow for on-device inference. If streaming to phone, add network hop latency. |
| Battery          | **Medium-high.** Pi 5 draws 3–8 W under load; a 10 Ah battery lasts ~2–4 h. Pi Zero 2 draws ~1.5 W. |
| Weight           | **Medium.** Pi 5 ~60 g + case ~30 g + battery ~200 g + camera ~15 g ≈ 300 g. |
| Heat             | **Medium.** Pi 5 needs a heatsink or active cooling at sustained load. Enclosed in a vest, heat dissipation is a real concern. |
| Compute          | **Limited.** No GPU/NPU for inference. CPU-only ONNX; Pi 5's quad A76 is roughly 3× slower than a mid-range phone's GPU delegate. |
| Camera quality   | **Good.** Official CSI cameras (IMX477, IMX708) are 12 MP with good optics. Wide-angle modules available. |
| Network          | **Medium.** Built-in Wi-Fi; no LTE without a modem HAT. Tethering to phone for cloud calls. |
| Cost             | **Medium.** Pi 5 ~$60, camera ~$25, battery ~$20, case/mount ~$15 = ~$120. |
| Maintainability  | **Medium.** Linux updates, SD card reliability concerns, custom OS image needed. More fragile than a phone. |

**Pros:** Full Linux environment for custom pipelines. CSI cameras offer
flexible optics. Open hardware ecosystem.

**Cons:** Weak inference without GPU/NPU. Extra device to charge, configure,
and maintain. Needs phone tethering for cloud calls and speech output.
SD card corruption risk.

### Option D: NVIDIA Jetson (Orin Nano / Orin NX)

A GPU-accelerated edge compute module on the vest.

| Criterion        | Assessment |
|------------------|------------|
| Latency          | **Very low.** Orin Nano runs SeaFormer-S at 30+ FPS in TensorRT. Orin NX exceeds 60 FPS. |
| Battery          | **High.** Orin Nano draws 7–15 W under load; Orin NX 10–25 W. A 20 Ah battery lasts 2–4 h at moderate load. |
| Weight           | **High.** Module ~80 g, carrier board ~100 g, heatsink ~60 g, battery ~400–500 g ≈ 650–750 g. |
| Heat             | **High.** Active cooling required. Vest-enclosed operation needs ducted airflow. |
| Compute          | **Excellent.** 1024-core Ampere GPU (Orin Nano) or 2048-core (Orin NX). CUDA, TensorRT, ONNX-TRT. |
| Camera quality   | **Excellent.** MIPI-CSI2 with up to 4 concurrent cameras. ISP built in. |
| Network          | **Medium.** Wi-Fi 6 + Bluetooth built in. No LTE without a modem; tethering to phone for cloud. |
| Cost             | **High.** Orin Nano ~$200, carrier ~$50–150, camera ~$25, battery ~$40, cooling ~$20 = ~$350–450. |
| Maintainability  | **Medium.** JetPack/Ubuntu updates. More complex than a phone; less fragile than a Pi. Carrier board ecosystem is maturing. |

**Pros:** By far the most compute headroom. Could run much larger models, stereo
depth, or real-time tracking. Future-proof for advanced perception.

**Cons:** Heavy, hot, expensive. Overkill for SeaFormer-S. Battery life is the
main constraint. Requires phone tethering for cloud and speech. Not something a
non-technical user can maintain.

### Option E: Android-based wearable compute

A small Android module (e.g. Qualcomm SA8255P dev kit, or a headless Android
SBC) purpose-built for the vest.

| Criterion        | Assessment |
|------------------|------------|
| Latency          | **Low.** Qualcomm NPU delegates (QNN, SNPE) run segmentation models at 10–30 FPS. |
| Battery          | **Medium.** 3–6 W typical; a 10 Ah battery lasts 3–6 h. |
| Weight           | **Medium.** Module ~50–100 g + battery ~200 g + camera ~30 g ≈ 280–330 g. |
| Heat             | **Medium.** Designed for embedded thermal envelopes; better than Jetson, worse than phone. |
| Compute          | **Very good.** Hexagon NPU / Adreno GPU acceleration. Strong TFLite and ONNX delegate support. |
| Camera quality   | **Good.** MIPI-CSI cameras; same modules as Pi. |
| Network          | **Good.** Many include 4G/5G modems. Wi-Fi + BT standard. |
| Cost             | **High.** Dev kits $200–500. Volume pricing unknown. Niche market. |
| Maintainability  | **Medium.** Android ecosystem for app delivery, but vendor BSP updates can lag. Long-term support varies. |

**Pros:** Best compute-per-watt ratio. NPU acceleration purpose-built for
inference. Full Android stack means the existing app can run natively. Built-in
cellular.

**Cons:** Expensive dev kits. Niche hardware with uncertain long-term vendor
support. Requires custom carrier/enclosure. Not yet a consumer-grade option.

---

## 3. Comparison matrix

| Criterion        | A: Phone on vest | B: Phone + USB cam | C: Raspberry Pi | D: Jetson Orin | E: Android wearable |
|------------------|:---:|:---:|:---:|:---:|:---:|
| Latency          | ★★★★ | ★★★ | ★★ | ★★★★★ | ★★★★ |
| Battery          | ★★★ | ★★★ | ★★ | ★ | ★★★ |
| Weight           | ★★★★★ | ★★★★ | ★★★ | ★★ | ★★★ |
| Heat             | ★★★ | ★★★ | ★★★ | ★ | ★★★ |
| Compute          | ★★★ | ★★★ | ★ | ★★★★★ | ★★★★ |
| Camera quality   | ★★★★ | ★★★ | ★★★★ | ★★★★★ | ★★★★ |
| Network          | ★★★★★ | ★★★★★ | ★★ | ★★ | ★★★★ |
| Cost             | ★★★★★ | ★★★★ | ★★★ | ★ | ★★ |
| Maintainability  | ★★★★★ | ★★★★ | ★★ | ★★ | ★★★ |

**No hardware is chosen.** The decision depends on real-device measurements
(Phase 12/14 verification), user testing, and cost/weight constraints that are
not yet established.

---

## 4. Software connection diagram

Regardless of hardware choice, the software layers connect identically:

```
┌──────────────────────────────────────────────────┐
│                  Hardware / OS                     │
│  Phone camera │ USB cam │ CSI cam │ MIPI cam       │
└────────┬───────┴────┬────┴────┬────┴────┬──────────┘
         │            │         │         │
         ▼            ▼         ▼         ▼
┌──────────────────────────────────────────────────┐
│              CameraSource adapter                  │
│  BrowserCameraSource │ ExternalCameraSource (future)│
│  MobileCameraSource  │                              │
└────────────────────────┬─────────────────────────┘
                         │  CameraFrame
                         │  { id, timestamp, width, height,
                         │    orientation, source, data }
                         ▼
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌──────────────────┐        ┌──────────────────────┐
│  Cloud Perception │        │  Local Fast-Perception │
│  (Gemini / cloud  │        │  (SeaFormer / ONNX     │
│   provider)       │        │   or TFLite / TRT)     │
│  ~0.5–2 FPS       │        │  ~5–15 FPS             │
└────────┬──────────┘        └────────┬────────────────┘
         │  SceneAnalysis              │  FastPerceptionFrame
         │                             │
         └──────────┬──────────────────┘
                    ▼
         ┌──────────────────┐
         │   Fusion Layer    │
         │  (asymmetric      │
         │   merge)          │
         └────────┬──────────┘
                  │  FusedPerception
                  ▼
         ┌──────────────────┐
         │   Safety Engine   │
         │  (deterministic   │
         │   risk decision)  │
         └────────┬──────────┘
                  │  SafetyAssessment
                  ▼
         ┌──────────────────┐
         │   Speech Engine   │
         │  (audio output    │
         │   to user)        │
         └──────────────────┘
```

### Per-option connection notes

**Option A (phone on vest):**
CameraSource is `BrowserCameraSource` (or a native `MobileCameraSource` in a
React Native port). Cloud calls go via the phone's network. Local inference uses
the phone's GPU/NPU delegate. Speech uses the phone's speaker or a Bluetooth
earpiece. Software is unchanged.

**Option B (phone + USB camera):**
CameraSource becomes `ExternalCameraSource` reading UVC frames via
`UsbManager` (Android) or WebUSB (browser). The phone still runs all compute
and speech. The `CameraFrame` carries `source: "external"` so the pipeline can
distinguish native vs. USB camera quality if needed. Software layers above
`CameraSource` are unchanged.

**Option C (Raspberry Pi):**
Two deployment models:
1. **Stream to phone:** Pi runs a minimal camera server; phone runs the app and
   pulls CameraFrames over WebSocket or local Wi-Fi. `ExternalCameraSource`
   adapter wraps the WebSocket client.
2. **Run on Pi:** The Next.js app runs in a Pi browser or headless Node. Cloud
   calls go through the Pi's network (tethered). Local inference is CPU-only
   (slow). Speech output via HDMI/3.5 mm or Bluetooth.

Software layers are unchanged in both models; only the `CameraSource` adapter
and the deployment target differ.

**Option D (Jetson Orin):**
Same two deployment models as Pi, but with far more compute. The Jetson can run
TensorRT-accelerated inference locally, so the local fast-perception backend
would use a `TensorRTBackend` instead of `OnnxVisionBackend`. The
`LocalVisionBackend` interface already supports this: swap the backend, keep
the pipeline. Cloud calls and speech route through a tethered phone or built-in
Wi-Fi.

**Option E (Android wearable):**
The app runs natively on the Android compute module. `MobileCameraSource` reads
from the MIPI camera. Local inference uses Qualcomm QNN or ONNX with NPU
delegate. Cloud calls use built-in cellular. Speech output via Bluetooth
earpiece. From the software's perspective, this is Option A with a different
form factor.

---

## 5. What stays unchanged

Regardless of hardware:

- **Core domain model** (`src/core/`) — `SceneObservation`, `SafetyAssessment`,
  `CameraFrame`, all Zod schemas.
- **Safety Engine** (`src/safety/`) — deterministic risk decision based on
  validated structured data.
- **Fusion layer** (`src/fusion/`) — asymmetric merge of cloud + local.
- **Speech Engine** (`src/speech/`) — priority queue, interruption, duplicate
  suppression.
- **Decision Engine** (`src/decision/`) — orchestration of the real-time pipeline.
- **Navigation Engine** (`src/navigation/`) — location, routing, off-route
  detection.
- **Cloud perception pipeline** (`src/perception/`, `src/providers/`) —
  `VisionProvider` interface and Gemini implementation.
- **Fast-perception pipeline** (`src/fast-perception/`) —
  `LocalVisionBackend` interface, answer rules, trust policy. Only the backend
  implementation changes (ONNX → TensorRT, etc.).

## 6. What changes per hardware option

| Component | A | B | C | D | E |
|-----------|---|---|---|---|---|
| `CameraSource` adapter | `BrowserCameraSource` or `MobileCameraSource` | `ExternalCameraSource` (UVC) | `ExternalCameraSource` (WebSocket) | `ExternalCameraSource` (CSI) | `MobileCameraSource` |
| Local backend | `OnnxVisionBackend` (GPU/NPU) | `OnnxVisionBackend` (GPU/NPU) | `OnnxVisionBackend` (CPU) | `TensorRTBackend` (GPU) | `OnnxVisionBackend` (NPU) |
| Cloud network | Built-in | Built-in | Tethered | Tethered or Wi-Fi | Built-in |
| Speech output | Phone speaker / BT | Phone speaker / BT | BT or wired | BT or wired | BT |
| Deployment | App store / PWA | App store / PWA | Custom image | Custom image | App store |

---

## 7. Prerequisites before choosing

1. **Real-device measurements** (Phases 12/14 verification): actual latency,
   duty cycle, memory, and battery consumption on phones.
2. **User research**: what form factor is acceptable? Weight, heat, charging
   frequency, pairing complexity.
3. **Cost constraints**: target retail price for the complete system.
4. **Camera field-of-view testing**: chest-mount angle vs. shoulder-mount vs.
   head-mount; required FoV for safe navigation.
5. **Regulatory**: medical device classification, CE/FCC, accessibility
   standards.
6. **ADE20K licence resolution** (ADR 0026): model weights distribution rights.

Do not choose hardware until these are resolved.
