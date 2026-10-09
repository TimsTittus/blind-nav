import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectCamera,
  detectLocation,
  detectMicrophone,
  detectOrientation,
  detectSpeech,
  detectAll,
  INITIAL_CAPABILITIES,
} from "./detect";

function mockPermissions(results: Record<string, PermissionState>) {
  Object.defineProperty(navigator, "permissions", {
    value: {
      query: vi.fn(({ name }: { name: string }) => {
        const state = results[name] ?? "prompt";
        return Promise.resolve({ state });
      }),
    },
    writable: true,
    configurable: true,
  });
}

function clearPermissions() {
  Object.defineProperty(navigator, "permissions", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe("detectCamera", () => {
  afterEach(() => {
    clearPermissions();
    vi.restoreAllMocks();
  });

  it("returns unavailable when getUserMedia is missing", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {},
      writable: true,
      configurable: true,
    });
    const result = await detectCamera();
    expect(result.state).toBe("unavailable");
  });

  it("returns denied when camera permission is denied", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn(() =>
          Promise.resolve([{ kind: "videoinput", deviceId: "cam-1" }]),
        ),
      },
      writable: true,
      configurable: true,
    });
    mockPermissions({ camera: "denied" });
    const result = await detectCamera();
    expect(result.state).toBe("denied");
  });

  it("returns available when camera exists and permission is granted", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn(() =>
          Promise.resolve([{ kind: "videoinput", deviceId: "cam-1" }]),
        ),
      },
      writable: true,
      configurable: true,
    });
    mockPermissions({ camera: "granted" });
    const result = await detectCamera();
    expect(result.state).toBe("available");
  });

  it("returns unavailable when no video input devices found", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn(() =>
          Promise.resolve([{ kind: "audioinput", deviceId: "mic-1" }]),
        ),
      },
      writable: true,
      configurable: true,
    });
    mockPermissions({ camera: "granted" });
    const result = await detectCamera();
    expect(result.state).toBe("unavailable");
  });
});

describe("detectLocation", () => {
  afterEach(() => {
    clearPermissions();
  });

  it("returns unavailable when geolocation is missing", async () => {
    const original = navigator.geolocation;
    Object.defineProperty(navigator, "geolocation", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const result = await detectLocation();
    expect(result.state).toBe("unavailable");
    Object.defineProperty(navigator, "geolocation", {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  it("returns denied when location permission is denied", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition: vi.fn(), clearWatch: vi.fn() },
      writable: true,
      configurable: true,
    });
    mockPermissions({ geolocation: "denied" });
    const result = await detectLocation();
    expect(result.state).toBe("denied");
  });

  it("returns available when geolocation is present and granted", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition: vi.fn(), clearWatch: vi.fn() },
      writable: true,
      configurable: true,
    });
    mockPermissions({ geolocation: "granted" });
    const result = await detectLocation();
    expect(result.state).toBe("available");
  });
});

describe("detectSpeech", () => {
  it("returns available when speechSynthesis has voices", async () => {
    const mockVoice = { name: "test", lang: "en" };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: vi.fn(() => [mockVoice]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    const result = await detectSpeech();
    expect(result.state).toBe("available");
    expect(result.reason).toContain("1 voices");
  });
});

describe("detectMicrophone", () => {
  afterEach(() => {
    clearPermissions();
  });

  it("returns unavailable when SpeechRecognition is missing", async () => {
    const win = window as unknown as Record<string, unknown>;
    const origSR = win["SpeechRecognition"];
    const origWebkit = win["webkitSpeechRecognition"];
    delete win["SpeechRecognition"];
    delete win["webkitSpeechRecognition"];

    const result = await detectMicrophone();
    expect(result.state).toBe("unavailable");

    win["SpeechRecognition"] = origSR;
    win["webkitSpeechRecognition"] = origWebkit;
  });
});

describe("detectOrientation", () => {
  it("returns available when DeviceOrientationEvent exists", async () => {
    const result = await detectOrientation();
    if ("DeviceOrientationEvent" in window) {
      expect(result.state).toBe("available");
    } else {
      expect(result.state).toBe("unavailable");
    }
  });
});

describe("detectAll", () => {
  it("returns all five capability reports", async () => {
    const result = await detectAll();
    expect(Object.keys(result)).toEqual([
      "camera",
      "location",
      "speech",
      "microphone",
      "orientation",
    ]);
    for (const report of Object.values(result)) {
      expect(report).toHaveProperty("state");
      expect(report).toHaveProperty("reason");
    }
  });
});

describe("INITIAL_CAPABILITIES", () => {
  it("starts all capabilities in checking state", () => {
    for (const report of Object.values(INITIAL_CAPABILITIES)) {
      expect(report.state).toBe("checking");
    }
  });
});
