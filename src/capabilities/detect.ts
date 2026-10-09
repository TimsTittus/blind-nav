import { DEFAULT_MODEL_URL } from "@/fast-perception";
import type { CapabilityReport, CapabilitySet } from "./types";
import { CHECKING_REPORT } from "./types";

function available(reason: string): CapabilityReport {
  return { state: "available", reason };
}

function unavailable(reason: string): CapabilityReport {
  return { state: "unavailable", reason };
}

function denied(reason: string): CapabilityReport {
  return { state: "denied", reason };
}

function prompt(reason: string): CapabilityReport {
  return { state: "prompt", reason };
}

async function queryPermission(name: string): Promise<PermissionState | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  try {
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

export async function detectCamera(): Promise<CapabilityReport> {
  if (typeof navigator === "undefined") {
    return unavailable("Not in a browser environment.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      return unavailable("Camera requires HTTPS.");
    }
    return unavailable("getUserMedia not supported by this browser.");
  }

  const perm = await queryPermission("camera");
  if (perm === "denied") return denied("Camera permission denied.");
  if (perm === "prompt") return prompt("Camera permission not yet requested.");

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasVideo = devices.some((d) => d.kind === "videoinput");
    if (!hasVideo) return unavailable("No camera detected on this device.");
  } catch {
    return prompt("Camera access requires permission.");
  }

  return available("Camera available.");
}

export async function detectLocation(): Promise<CapabilityReport> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return unavailable("Geolocation not supported by this browser.");
  }

  const perm = await queryPermission("geolocation");
  if (perm === "denied") return denied("Location permission denied.");
  if (perm === "prompt")
    return prompt("Location permission not yet requested.");

  return available("Location available.");
}

export async function detectSpeech(): Promise<CapabilityReport> {
  if (typeof window === "undefined") {
    return unavailable("Not in a browser environment.");
  }

  if (!("speechSynthesis" in window)) {
    return unavailable("SpeechSynthesis not supported by this browser.");
  }

  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      const onVoicesChanged = () => {
        synth.removeEventListener("voiceschanged", onVoicesChanged);
        resolve();
      };
      synth.addEventListener("voiceschanged", onVoicesChanged);
      setTimeout(resolve, 1000);
    });
    voices = synth.getVoices();
  }

  if (voices.length === 0) {
    return unavailable("No speech voices available.");
  }

  return available(
    `Speech synthesis available (${String(voices.length)} voices).`,
  );
}

export async function detectMicrophone(): Promise<CapabilityReport> {
  if (typeof window === "undefined") {
    return unavailable("Not in a browser environment.");
  }

  const win = window as unknown as Record<string, unknown>;
  const hasSpeechRecognition =
    "SpeechRecognition" in win || "webkitSpeechRecognition" in win;

  if (!hasSpeechRecognition) {
    return unavailable(
      "SpeechRecognition not supported. Voice input unavailable.",
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return unavailable("Microphone access not supported by this browser.");
  }

  const perm = await queryPermission("microphone");
  if (perm === "denied") return denied("Microphone permission denied.");
  if (perm === "prompt") {
    return prompt("Microphone permission not yet requested.");
  }

  return available("Microphone and speech recognition available.");
}

export async function detectOrientation(): Promise<CapabilityReport> {
  if (typeof window === "undefined") {
    return unavailable("Not in a browser environment.");
  }

  const hasAbsolute = "AbsoluteOrientationSensor" in window;
  const hasRelative = "RelativeOrientationSensor" in window;
  const hasDeviceOrientation = "DeviceOrientationEvent" in window;

  if (hasAbsolute || hasRelative) {
    return available("Orientation sensor available.");
  }

  if (hasDeviceOrientation) {
    const doeEvent = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof doeEvent.requestPermission === "function") {
      return prompt("Orientation requires permission (iOS).");
    }
    return available("Device orientation available (legacy API).");
  }

  return unavailable("Orientation sensors not supported.");
}

/**
 * Local perception needs two separate things, and both are reported honestly
 * because neither can be assumed:
 *
 * 1. **A runtime.** WebGPU where the device has a real GPU, WASM otherwise.
 *    WASM without cross-origin isolation is single-threaded, which Phase 13
 *    measured at roughly 1.5× the multi-threaded time — usable, but reported.
 * 2. **Weights.** No model ships with the app (ADR 0026/0027 — the ADE20K
 *    licence review is unresolved), so a `HEAD` request checks whether a
 *    developer has placed one. A missing model is `unavailable`, never a quiet
 *    fallback that leaves the user believing local checks are running.
 */
export async function detectLocalPerception(
  modelUrl = DEFAULT_MODEL_URL,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<CapabilityReport> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return unavailable("Not in a browser environment.");
  }

  const hasWasm = typeof WebAssembly === "object";
  const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  const hasWebGpu = gpu !== undefined;

  if (!hasWasm && !hasWebGpu) {
    return unavailable("Neither WebGPU nor WebAssembly is supported.");
  }

  const doFetch = deps.fetchImpl ?? fetch;
  let modelPresent = false;
  try {
    const response = await doFetch(modelUrl, { method: "HEAD" });
    modelPresent = response.ok;
  } catch {
    modelPresent = false;
  }

  if (!modelPresent) {
    return unavailable(
      "No local model installed. The app ships without weights; see docs/fast-perception.md.",
    );
  }

  const isolated =
    typeof globalThis.crossOriginIsolated === "boolean"
      ? globalThis.crossOriginIsolated
      : false;
  const runtime = hasWebGpu
    ? "WebGPU"
    : isolated
      ? "WebAssembly (multi-threaded)"
      : "WebAssembly (single-threaded)";

  return available(`Local perception available via ${runtime}.`);
}

export async function detectAll(): Promise<CapabilitySet> {
  const [camera, location, speech, microphone, orientation, localPerception] =
    await Promise.all([
      detectCamera(),
      detectLocation(),
      detectSpeech(),
      detectMicrophone(),
      detectOrientation(),
      detectLocalPerception(),
    ]);
  return {
    camera,
    location,
    speech,
    microphone,
    orientation,
    localPerception,
  };
}

export const INITIAL_CAPABILITIES: CapabilitySet = {
  camera: CHECKING_REPORT,
  location: CHECKING_REPORT,
  speech: CHECKING_REPORT,
  microphone: CHECKING_REPORT,
  orientation: CHECKING_REPORT,
  localPerception: CHECKING_REPORT,
};
