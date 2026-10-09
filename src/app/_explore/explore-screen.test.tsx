import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSession, clearSession } from "../_session/session-store";
import { ExploreScreen } from "./explore-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ExploreScreen", () => {
  beforeEach(() => {
    const mockTrack = {
      stop: vi.fn(),
      kind: "video",
      getSettings: () => ({ facingMode: "environment" }),
      getCapabilities: () => ({}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [mockTrack],
          getVideoTracks: () => [mockTrack],
        }),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      geolocation: null,
    });

    vi.stubGlobal("speechSynthesis", {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
      speaking: false,
      paused: false,
      pending: false,
      onvoiceschanged: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text = "";
        rate = 1;
        pitch = 1;
        volume = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
      },
    );
  });

  afterEach(() => {
    clearSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders ActiveExplore when an explore session is active without infinite loop", async () => {
    await act(async () => {
      startSession({ mode: "explore" });
    });

    let rendered: ReturnType<typeof render> | undefined;
    await act(async () => {
      rendered = render(<ExploreScreen />);
    });

    expect(screen.getByText("Explore mode")).toBeInTheDocument();
    expect(
      rendered!.container.querySelector(".nav-screen"),
    ).toBeInTheDocument();
  });
});
