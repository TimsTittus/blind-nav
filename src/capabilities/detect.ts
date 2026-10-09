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

export async function detectAll(): Promise<CapabilitySet> {
  const [camera, location, speech, microphone, orientation] = await Promise.all(
    [
      detectCamera(),
      detectLocation(),
      detectSpeech(),
      detectMicrophone(),
      detectOrientation(),
    ],
  );
  return { camera, location, speech, microphone, orientation };
}

export const INITIAL_CAPABILITIES: CapabilitySet = {
  camera: CHECKING_REPORT,
  location: CHECKING_REPORT,
  speech: CHECKING_REPORT,
  microphone: CHECKING_REPORT,
  orientation: CHECKING_REPORT,
};
