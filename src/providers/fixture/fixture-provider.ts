import type { SceneAnalysis } from "@/core";
import { normalizeSceneObservation } from "../normalize";
import type { VisionProvider } from "../provider";
import type { AnalyzeFrameInput, AnalyzeFrameOptions } from "../types";
import {
  DEFAULT_FIXTURE_SCENE,
  FIXTURE_SCENES,
  type FixtureSceneId,
  isFixtureSceneId,
} from "./fixtures";

export interface FixtureProviderOptions {
  /** Which canned scene to return. Defaults to the "clear" fixture. */
  scene?: FixtureSceneId;
  /** Simulated latency; lets the UI and tests exercise the loading path. */
  delayMs?: number;
}

/**
 * Development/test vision provider that returns a canned {@link SceneAnalysis}
 * without any network call or API key. It honours the abort signal so the
 * concurrency/stale-response tests behave exactly as they do against Gemini.
 */
export class FixtureVisionProvider implements VisionProvider {
  readonly id = "fixture";
  private scene: FixtureSceneId;
  private readonly delayMs: number;

  constructor(options: FixtureProviderOptions = {}) {
    this.scene = options.scene ?? DEFAULT_FIXTURE_SCENE;
    this.delayMs = options.delayMs ?? 0;
  }

  /** Switch the scene a subsequent `analyzeFrame` will return. */
  setScene(scene: FixtureSceneId): void {
    this.scene = scene;
  }

  async analyzeFrame(
    input: AnalyzeFrameInput,
    options?: AnalyzeFrameOptions,
  ): Promise<SceneAnalysis> {
    const scene = pickScene(input, this.scene);
    if (this.delayMs > 0) await delay(this.delayMs, options?.signal);
    throwIfAborted(options?.signal);
    return normalizeSceneObservation(FIXTURE_SCENES[scene], {
      capturedAt: input.frame.capturedAt,
      provider: this.id,
    });
  }
}

/**
 * A caller may request a specific fixture per frame via the (dev-only) context
 * `scenario` hint; otherwise the provider's configured scene is used.
 */
function pickScene(
  input: AnalyzeFrameInput,
  fallback: FixtureSceneId,
): FixtureSceneId {
  const hint = input.context?.scenario;
  return hint && isFixtureSceneId(hint) ? hint : fallback;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The analysis was aborted.", "AbortError");
  }
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The analysis was aborted.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The analysis was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
