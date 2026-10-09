import type { CameraState } from "@/camera";
import {
  CameraController,
  FrameCapture,
  FrameScheduler,
  type CapturedFrame,
} from "@/camera";
import type { NavigationSession, SafetyAssessment } from "@/core";
import {
  CONSERVATIVE_TRUST_POLICY,
  FastFrameSource,
  FastPerceptionController,
  type FastPerceptionConfig,
  type FastPerceptionState,
  type FastTrustPolicy,
  type LocalVisionBackend,
  type RgbaFrame,
} from "@/fast-perception";
import { fusePerception, type FusedPerception } from "@/fusion";
import {
  LocationController,
  RouteTracker,
  type LocationSnapshot,
} from "@/navigation";
import {
  blobToDataUrl,
  createAnalysisClient,
  createSceneQueryClient,
  INITIAL_PERCEPTION_STATE,
  PerceptionController,
  type AnalysisClient,
  type PerceptionState,
  type SceneQueryClient,
} from "@/perception";
import { PerformanceMonitor, type PerformanceMetrics } from "@/performance";
import {
  SafetyEngine,
  type PerceptionFusionInput,
  type SafetyContext,
} from "@/safety";
import { SpeechEngine, WebTtsProvider, type VoiceSettings } from "@/speech";
import {
  SESSION_CONTROLLER_CONFIG,
  type SessionControllerConfig,
} from "./config";
import {
  SceneQueryHandler,
  type SceneQuerySnapshot,
} from "./scene-query-handler";
import { SpeechDispatch, type SpeechSink } from "./speech-dispatch";
import type {
  PerceptionFreshness,
  SessionControllerSnapshot,
  SessionPhase,
  SessionStats,
} from "./types";

type Listener = () => void;

const IDLE_FAST_PERCEPTION: FastPerceptionState = {
  availability: "unavailable",
  frame: null,
  appliedSequence: -1,
  lastError: null,
  inFlight: false,
  intervalMs: 0,
  inferenceMs: null,
  deviceTooSlow: false,
  schedulerState: "stopped",
};

const UNKNOWN_SAFETY: SafetyAssessment = {
  level: "unknown",
  action: "none",
  reasons: ["Session not started"],
  confidence: 0,
  assessedAt: 0,
  expiresAt: 0,
  degraded: true,
};

export interface NavigationSessionControllerDeps {
  analysisClient?: AnalysisClient;
  queryClient?: SceneQueryClient;
  voiceSettings?: VoiceSettings;
  config?: Partial<SessionControllerConfig>;
  now?: () => number;
  /**
   * Creates the local inference backend. Omitted means cloud-only, which is
   * the default: no weights ship with the app (ADR 0026/0027). Rejecting is a
   * supported outcome — the session continues cloud-only.
   */
  createFastBackend?: () => Promise<LocalVisionBackend>;
  /** What local evidence is allowed to claim. */
  trustPolicy?: FastTrustPolicy;
  fastPerceptionConfig?: Partial<FastPerceptionConfig>;
  /**
   * Overrides the pixel grab for the local loop. Defaults to reading the live
   * camera via {@link FastFrameSource}; injectable so the loop can be driven
   * without a real video element.
   */
  grabFastFrame?: (size: number) => RgbaFrame;
}

/**
 * Orchestrates the full real-time navigation pipeline:
 * camera → frame capture → AI analysis → safety → speech.
 *
 * React observes state via subscribe/getSnapshot (useSyncExternalStore).
 * The controller owns every subsystem lifecycle; React never creates or
 * disposes subsystems directly.
 */
export class NavigationSessionController {
  private readonly config: SessionControllerConfig;
  private readonly now: () => number;

  private camera: CameraController | null = null;
  private frameCapture: FrameCapture | null = null;
  private frameScheduler: FrameScheduler<CapturedFrame> | null = null;
  private perception: PerceptionController | null = null;
  private location: LocationController | null = null;
  private routeTracker: RouteTracker | null = null;
  private safetyEngine: SafetyEngine | null = null;
  private speechEngine: SpeechEngine | null = null;
  private speechDispatch: SpeechDispatch | null = null;

  private sceneQueryHandler: SceneQueryHandler | null = null;
  private readonly perfMonitor: PerformanceMonitor;

  private fastFrameSource: FastFrameSource | null = null;
  private fastPerception: FastPerceptionController | null = null;
  private readonly createFastBackend:
    (() => Promise<LocalVisionBackend>) | null;
  private readonly trustPolicy: FastTrustPolicy;
  private readonly fastPerceptionConfig: Partial<FastPerceptionConfig>;
  private readonly grabFastFrameOverride: ((size: number) => RgbaFrame) | null;

  private readonly analysisClient: AnalysisClient;
  private readonly queryClient: SceneQueryClient;
  private voiceSettings: VoiceSettings;

  private session: NavigationSession | null = null;
  private phase: SessionPhase = "idle";
  private cameraState: CameraState = "idle";
  private perceptionState: PerceptionState = INITIAL_PERCEPTION_STATE;
  private safetyAssessment: SafetyAssessment = UNKNOWN_SAFETY;
  private locationSnapshot: LocationSnapshot = {
    state: "permission_required",
    location: null,
    heading: null,
    error: null,
  };
  private routeState: RouteTracker["state"] = {
    status: "idle",
    currentStepIndex: 0,
    distanceToStepMeters: 0,
    totalProgressFraction: 0,
    currentStep: null,
    nextStep: null,
  };
  private lastError: string | null = null;
  private querySnapshot: SceneQuerySnapshot = {
    state: "idle",
    lastAnswer: null,
    lastError: null,
  };

  private fastState: FastPerceptionState = IDLE_FAST_PERCEPTION;
  private fusion: FusedPerception | null = null;
  private fastPerceptionError: string | null = null;
  private localInferenceCount = 0;
  private lastDispatchedLevel: SafetyAssessment["level"] | null = null;
  private lastDispatchedAt = -Infinity;

  private frameCount = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private aiRequestCount = 0;
  private lastSpeechAt: number | null = null;

  private readonly listeners = new Set<Listener>();
  private cleanups: Array<() => void> = [];
  private safetyInterval: ReturnType<typeof setInterval> | null = null;

  constructor(deps: NavigationSessionControllerDeps = {}) {
    this.analysisClient = deps.analysisClient ?? createAnalysisClient();
    this.queryClient = deps.queryClient ?? createSceneQueryClient();
    this.voiceSettings = deps.voiceSettings ?? {
      enabled: true,
      rate: 1,
      pitch: 1,
      volume: 1,
    };
    this.config = { ...SESSION_CONTROLLER_CONFIG, ...deps.config };
    this.now = deps.now ?? (() => Date.now());
    this.perfMonitor = new PerformanceMonitor({ now: this.now });
    this.createFastBackend = deps.createFastBackend ?? null;
    this.trustPolicy = deps.trustPolicy ?? CONSERVATIVE_TRUST_POLICY;
    this.fastPerceptionConfig = deps.fastPerceptionConfig ?? {};
    this.grabFastFrameOverride = deps.grabFastFrame ?? null;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionControllerSnapshot => {
    return {
      phase: this.phase,
      camera: this.cameraState,
      perception: this.perceptionState,
      perceptionFreshness: this.computeFreshness(),
      safety: this.safetyAssessment,
      location: this.locationSnapshot,
      route: this.routeState,
      lastError: this.lastError,
      stats: this.getStats(),
      query: this.querySnapshot,
      fastPerception: this.fastState,
      fusion: this.fusion,
      fastPerceptionError: this.fastPerceptionError,
    };
  };

  async start(session: NavigationSession): Promise<void> {
    if (this.phase !== "idle" && this.phase !== "stopped") return;

    this.session = session;
    this.setPhase("starting");
    this.lastError = null;
    this.resetStats();

    try {
      this.createSubsystems();
      this.wireSubsystems();

      this.location!.start();
      await this.camera!.start();

      if (session.route) {
        this.routeTracker!.setRoute(session.route);
        this.syncRouteState();
      }

      this.frameScheduler!.start();
      this.startSafetyLoop();
      this.perfMonitor.start();

      this.setPhase("running");

      // Local perception is strictly additive: it loads in the background and
      // a failure never takes the cloud path (or the session) down.
      void this.initFastPerception();
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Failed to start session";
      this.teardownSubsystems();
      this.setPhase("error");
    }
  }

  stop(): void {
    if (this.phase === "idle" || this.phase === "stopped") return;
    this.setPhase("stopping");
    this.teardownSubsystems();
    this.setPhase("stopped");
  }

  pause(): void {
    if (this.phase !== "running") return;
    this.frameScheduler?.pause();
    this.fastPerception?.pause();
    this.camera?.pause();
    this.speechEngine?.pause();
    this.setPhase("paused");
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.camera?.resume();
    this.frameScheduler?.resume();
    this.fastPerception?.resume();
    this.speechEngine?.resume();
    this.setPhase("running");
  }

  dispose(): void {
    this.stop();
    this.perfMonitor.dispose();
    this.listeners.clear();
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return this.perfMonitor.getMetrics();
  }

  updateVoiceSettings(settings: VoiceSettings): void {
    this.voiceSettings = settings;
    if (this.speechEngine) {
      this.speechEngine.settings = settings;
    }
  }

  toggleVoice(): void {
    const next = !this.voiceSettings.enabled;
    this.updateVoiceSettings({ ...this.voiceSettings, enabled: next });
    if (!next) this.speechEngine?.stop();
  }

  submitQuery(question: string): void {
    if (this.phase !== "running" || !this.sceneQueryHandler) return;
    void this.sceneQueryHandler.submitQuestion(question);
  }

  cancelQuery(): void {
    this.sceneQueryHandler?.cancel();
  }

  attachVideo(element: HTMLVideoElement | null): void {
    this.camera?.attachVideo(element);
  }

  getActiveVideo(): HTMLVideoElement | null {
    return this.camera?.getActiveVideo() ?? null;
  }

  get canSwitchCamera(): boolean {
    return this.camera?.getSnapshot().canSwitch ?? false;
  }

  get isSwitchingCamera(): boolean {
    return this.camera?.getSnapshot().switching ?? false;
  }

  switchCamera(): void {
    void this.camera?.switchCamera();
  }

  startCamera(): void {
    void this.camera?.start();
  }

  private createSubsystems(): void {
    this.camera = new CameraController();
    this.frameCapture = new FrameCapture(
      () => this.camera?.getActiveVideo() ?? null,
    );

    this.perception = new PerceptionController({
      client: this.analysisClient,
      now: this.now,
    });

    this.fastFrameSource = new FastFrameSource(
      () => this.camera?.getActiveVideo() ?? null,
    );

    this.location = new LocationController();
    this.routeTracker = new RouteTracker({ now: this.now });
    this.safetyEngine = new SafetyEngine({
      assessmentTtlMs: this.config.safetyTtlMs,
    });

    const ttsProvider = new WebTtsProvider();
    this.speechEngine = new SpeechEngine({
      provider: ttsProvider,
      settings: this.voiceSettings,
      now: this.now,
    });

    const speechSink: SpeechSink = {
      speak: (text, priority) => {
        this.speechEngine?.speak(text, priority);
        this.lastSpeechAt = this.now();
        this.perfMonitor.recordSpeechDispatched();
        this.perfMonitor.recordSpeechQueueLength(
          this.speechEngine?.pendingCount ?? 0,
        );
        this.notify();
      },
    };
    this.speechDispatch = new SpeechDispatch(this.config, speechSink);

    this.frameScheduler = new FrameScheduler<CapturedFrame>({
      intervalMs: this.config.analysisIntervalMs,
      capture: (signal) => this.frameCapture!.captureFrame({ signal }),
      onFrame: (frame) => this.onFrame(frame),
      onError: (error) => this.onFrameError(error),
      visibility: null,
    });

    this.sceneQueryHandler = new SceneQueryHandler({
      queryClient: this.queryClient,
      speechEngine: this.speechEngine,
      captureFrame: () => this.frameCapture!.captureFrame({}),
    });
  }

  private wireSubsystems(): void {
    const cameraUnsub = this.camera!.subscribe(() => {
      this.cameraState = this.camera!.getSnapshot().state;
      this.notify();
    });
    this.cleanups.push(cameraUnsub);

    const perceptionUnsub = this.perception!.subscribe(() => {
      const prev = this.perceptionState;
      this.perceptionState = this.perception!.getSnapshot();
      this.onPerceptionUpdate(prev);
      this.notify();
    });
    this.cleanups.push(perceptionUnsub);

    const locationUnsub = this.location!.subscribe(() => {
      this.locationSnapshot = this.location!.getSnapshot();
      this.onLocationUpdate();
      this.notify();
    });
    this.cleanups.push(locationUnsub);

    const queryUnsub = this.sceneQueryHandler!.subscribe(() => {
      this.querySnapshot = this.sceneQueryHandler!.getSnapshot();
      this.notify();
    });
    this.cleanups.push(queryUnsub);
  }

  private teardownSubsystems(): void {
    this.perfMonitor.stop();
    this.stopSafetyLoop();
    this.frameScheduler?.stop();
    this.fastPerception?.dispose();
    this.perception?.dispose();
    this.camera?.stop();
    this.location?.stop();
    this.speechEngine?.dispose();
    this.speechDispatch?.reset();
    this.routeTracker?.clearRoute();

    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];

    this.camera = null;
    this.frameCapture = null;
    this.frameScheduler = null;
    this.fastPerception = null;
    this.fastFrameSource = null;
    this.fastState = IDLE_FAST_PERCEPTION;
    this.fusion = null;
    this.perception = null;
    this.location = null;
    this.routeTracker = null;
    this.safetyEngine = null;
    this.speechEngine = null;
    this.speechDispatch = null;
    this.sceneQueryHandler?.dispose();
    this.sceneQueryHandler = null;
  }

  private async onFrame(frame: CapturedFrame): Promise<void> {
    const captureLatency = this.now() - frame.capturedAt;
    this.perfMonitor.recordFrameCapture(captureLatency);
    this.trackFps();
    let dataUrl: string;
    try {
      dataUrl = await blobToDataUrl(frame.blob);
    } catch {
      return;
    }
    this.perception?.submit({
      dataUrl,
      capturedAt: frame.capturedAt,
      width: frame.width,
      height: frame.height,
    });
  }

  private onFrameError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Frame capture error";
    this.lastError = message;
    this.notify();
  }

  private onPerceptionUpdate(prev: PerceptionState): void {
    if (this.phase !== "running") return;

    if (
      this.perceptionState.analysis &&
      this.perceptionState.analysis !== prev.analysis
    ) {
      this.aiRequestCount++;
      if (this.perceptionState.latencyMs !== null) {
        this.perfMonitor.recordAiRequestEnd(
          this.now() - this.perceptionState.latencyMs,
        );
      }
      this.runSafetyAssessment();
    } else if (
      this.perceptionState.lastError &&
      this.perceptionState.lastError !== prev.lastError
    ) {
      this.perfMonitor.recordAiFailure();
    }

    const prevFreshness = this.computeFreshnessWith(prev);
    const currFreshness = this.computeFreshness();
    if (currFreshness !== prevFreshness) {
      this.speechDispatch?.onFreshnessChange(currFreshness, this.now());
    }
  }

  /**
   * Starts the local loop. Called once per session, in the background: a
   * missing model file or an unsupported runtime is an expected outcome that
   * leaves the session running cloud-only.
   */
  private async initFastPerception(): Promise<void> {
    if (!this.createFastBackend) {
      this.fastPerceptionError = "Local perception is not configured.";
      this.notify();
      return;
    }
    if (!this.config.fastPerceptionEnabled) {
      this.fastPerceptionError = "Local perception is disabled by config.";
      this.notify();
      return;
    }

    let backend: LocalVisionBackend;
    try {
      backend = await this.createFastBackend();
    } catch (error) {
      this.fastPerceptionError =
        error instanceof Error
          ? error.message
          : "Local perception backend is unavailable.";
      this.notify();
      return;
    }

    // The session may have been stopped while the model was loading.
    const grabFrame =
      this.grabFastFrameOverride ??
      (this.fastFrameSource
        ? (size: number) => this.fastFrameSource!.grab(size)
        : null);
    if (this.phase !== "running" || !grabFrame) {
      backend.dispose();
      return;
    }

    const controller = new FastPerceptionController({
      backend,
      grabFrame,
      config: this.fastPerceptionConfig,
      now: this.now,
    });
    this.fastPerception = controller;

    const unsubscribe = controller.subscribe(() => {
      const previous = this.fastState;
      this.fastState = controller.getSnapshot();
      this.onFastPerceptionUpdate(previous);
      this.notify();
    });
    this.cleanups.push(unsubscribe);

    this.fastPerceptionError = null;
    controller.start();
    this.notify();
  }

  private onFastPerceptionUpdate(previous: FastPerceptionState): void {
    if (this.phase !== "running") return;

    const frame = this.fastState.frame;
    if (frame && frame !== previous.frame) {
      this.localInferenceCount++;
      this.perfMonitor.recordLocalInference(frame.inferenceMs);
      this.runSafetyAssessment();
      return;
    }

    if (
      this.fastState.availability === "error" &&
      previous.availability !== "error"
    ) {
      this.perfMonitor.recordLocalFailure();
      // Losing local evidence can only *reduce* what is known, so reassess.
      this.runSafetyAssessment();
    }
  }

  private runSafetyAssessment(): void {
    if (!this.safetyEngine) return;

    const now = this.now();
    const fused = fusePerception({
      cloud: this.perceptionState.analysis,
      local: this.fastState.frame,
      policy: this.trustPolicy,
      now,
    });
    this.fusion = fused;

    const fusionInput: PerceptionFusionInput | undefined =
      fused.mode === "hybrid" || fused.mode === "local_only"
        ? {
            localOnly: fused.mode === "local_only",
            conflicts: fused.conflicts.map(
              (c) =>
                `${c.question}: cloud says ${c.cloud}, local says ${c.local}`,
            ),
          }
        : undefined;

    const context: SafetyContext = {
      sceneAnalysis: fused.analysis,
      location: this.locationSnapshot.location,
      heading: this.locationSnapshot.heading,
      route: this.session?.route ?? null,
      currentRouteStep: this.routeState.currentStep,
      now,
      ...(fusionInput ? { fusion: fusionInput } : {}),
    };

    const result = this.safetyEngine.assess(context);
    this.safetyAssessment = result.assessment;
    this.perfMonitor.recordSafetyAssessed();

    if (this.shouldDispatchSpeech(result.assessment, now)) {
      this.lastDispatchedLevel = result.assessment.level;
      this.lastDispatchedAt = now;
      this.speechDispatch?.onSafetyUpdate(
        result.assessment,
        result.fusionOverride,
        now,
      );
    }
  }

  /**
   * The local loop reassesses safety several times a second, but
   * `SpeechDispatch` announces `danger`/`critical` immediately and without a
   * cooldown — correct for a real escalation, unusable at 7 Hz. So a repeat of
   * the level already announced is held back until the safety cooldown has
   * elapsed. A *change* in level is always passed through at once.
   */
  private shouldDispatchSpeech(
    assessment: SafetyAssessment,
    now: number,
  ): boolean {
    if (assessment.level !== this.lastDispatchedLevel) return true;
    return now - this.lastDispatchedAt >= this.config.safetySpeechCooldownMs;
  }

  private startSafetyLoop(): void {
    this.safetyInterval = setInterval(() => {
      if (this.phase !== "running") return;
      if (
        this.safetyEngine &&
        this.safetyEngine.isExpired(this.safetyAssessment, this.now())
      ) {
        this.runSafetyAssessment();
        this.notify();
      }
    }, this.config.safetyTtlMs);
  }

  private stopSafetyLoop(): void {
    if (this.safetyInterval !== null) {
      clearInterval(this.safetyInterval);
      this.safetyInterval = null;
    }
  }

  private onLocationUpdate(): void {
    this.perfMonitor.recordGpsUpdate(
      this.locationSnapshot.location?.accuracyMeters ?? null,
    );
    if (!this.routeTracker || !this.locationSnapshot.location) return;
    const prevState = this.routeState;
    this.routeState = this.routeTracker.update(this.locationSnapshot.location);
    this.syncRouteState();

    if (this.routeState !== prevState) {
      this.speechDispatch?.onRouteUpdate(this.routeState, this.now());
    }
  }

  private syncRouteState(): void {
    if (!this.routeTracker) return;
    this.routeState = this.routeTracker.state;
  }

  private computeFreshness(): PerceptionFreshness {
    return this.computeFreshnessWith(this.perceptionState);
  }

  private computeFreshnessWith(state: PerceptionState): PerceptionFreshness {
    if (!state.analysis || state.lastUpdatedAt === null) return "none";
    const age = this.now() - state.lastUpdatedAt;
    if (age <= this.config.freshThresholdMs) return "fresh";
    if (age <= this.config.agingThresholdMs) return "aging";
    return "stale";
  }

  private resetStats(): void {
    this.frameCount = 0;
    this.fpsWindowStart = this.now();
    this.fps = 0;
    this.aiRequestCount = 0;
    this.lastSpeechAt = null;
    this.localInferenceCount = 0;
    this.lastDispatchedLevel = null;
    this.lastDispatchedAt = -Infinity;
    this.fusion = null;
    this.fastPerceptionError = null;
  }

  private trackFps(): void {
    this.frameCount++;
    const elapsed = this.now() - this.fpsWindowStart;
    if (elapsed >= 1_000) {
      this.fps = Math.round((this.frameCount / elapsed) * 1_000);
      this.frameCount = 0;
      this.fpsWindowStart = this.now();
    }
  }

  private getStats(): SessionStats {
    return {
      fps: this.fps,
      aiRequestCount: this.aiRequestCount,
      aiLatencyMs: this.perceptionState.latencyMs,
      lastAnalysisAt: this.perceptionState.lastUpdatedAt,
      lastSpeechAt: this.lastSpeechAt,
      localInferenceCount: this.localInferenceCount,
      localLatencyMs: this.fastState.inferenceMs,
    };
  }

  private setPhase(phase: SessionPhase): void {
    this.phase = phase;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
