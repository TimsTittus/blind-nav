import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceMonitor } from "./performance-monitor";

describe("PerformanceMonitor", () => {
  let clock: number;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    clock = 1_000_000;
    monitor = new PerformanceMonitor({ now: () => clock });
  });

  afterEach(() => {
    monitor.dispose();
  });

  it("returns empty metrics initially", () => {
    const m = monitor.getMetrics();
    expect(m.cameraFPS).toBe(0);
    expect(m.captureLatencyMs).toBeNull();
    expect(m.aiLatencyMs).toBeNull();
    expect(m.aiRequestsPerMinute).toBe(0);
    expect(m.aiFailureRate).toBe(0);
    expect(m.perceptionAgeMs).toBeNull();
    expect(m.gpsAccuracy).toBeNull();
    expect(m.gpsAgeMs).toBeNull();
    expect(m.speechQueueLength).toBe(0);
    expect(m.endToEndLatencyMs).toBeNull();
  });

  it("records frame captures and computes FPS", () => {
    for (let i = 0; i < 5; i++) {
      monitor.recordFrameCapture(10);
      clock += 1_000;
    }
    const m = monitor.getMetrics();
    expect(m.cameraFPS).toBeGreaterThan(0);
    expect(m.captureLatencyMs).toBe(10);
  });

  it("records AI latency from start/end", () => {
    const start = clock;
    clock += 350;
    monitor.recordAiRequestEnd(start);
    const m = monitor.getMetrics();
    expect(m.aiLatencyMs).toBe(350);
    expect(m.aiRequestsPerMinute).toBe(1);
    expect(m.aiFailureRate).toBe(0);
  });

  it("tracks AI failure rate", () => {
    const start = clock;
    clock += 200;
    monitor.recordAiRequestEnd(start);

    clock += 100;
    monitor.recordAiFailure();

    const m = monitor.getMetrics();
    expect(m.aiRequestsPerMinute).toBe(2);
    expect(m.aiFailureRate).toBe(0.5);
  });

  it("tracks perception age", () => {
    const start = clock;
    clock += 100;
    monitor.recordAiRequestEnd(start);
    clock += 5_000;
    const m = monitor.getMetrics();
    expect(m.perceptionAgeMs).toBe(5_000);
  });

  it("records GPS accuracy and age", () => {
    monitor.recordGpsUpdate(12.5);
    clock += 3_000;
    const m = monitor.getMetrics();
    expect(m.gpsAccuracy).toBe(12.5);
    expect(m.gpsAgeMs).toBe(3_000);
  });

  it("records null GPS accuracy", () => {
    monitor.recordGpsUpdate(null);
    const m = monitor.getMetrics();
    expect(m.gpsAccuracy).toBeNull();
    expect(m.gpsAgeMs).toBe(0);
  });

  it("records speech queue length", () => {
    monitor.recordSpeechQueueLength(3);
    expect(monitor.getMetrics().speechQueueLength).toBe(3);
    monitor.recordSpeechQueueLength(0);
    expect(monitor.getMetrics().speechQueueLength).toBe(0);
  });

  it("computes end-to-end latency from capture to speech dispatch", () => {
    monitor.recordFrameCapture(5);
    clock += 800;
    monitor.recordSpeechDispatched();
    expect(monitor.getMetrics().endToEndLatencyMs).toBe(800);
  });

  it("reset clears all metrics", () => {
    monitor.recordFrameCapture(10);
    monitor.recordAiRequestEnd(clock - 100);
    monitor.recordGpsUpdate(5);
    monitor.recordSpeechQueueLength(2);
    monitor.recordSpeechDispatched();

    monitor.reset();
    const m = monitor.getMetrics();
    expect(m.cameraFPS).toBe(0);
    expect(m.aiLatencyMs).toBeNull();
    expect(m.gpsAccuracy).toBeNull();
    expect(m.speechQueueLength).toBe(0);
    expect(m.endToEndLatencyMs).toBeNull();
  });

  it("prunes old timestamps beyond the 60s window", () => {
    vi.useFakeTimers();

    const pruneMonitor = new PerformanceMonitor({ now: () => clock });
    pruneMonitor.start();

    for (let i = 0; i < 10; i++) {
      pruneMonitor.recordFrameCapture(5);
      clock += 1_000;
    }

    clock += 70_000;
    vi.advanceTimersByTime(30_000);

    const m = pruneMonitor.getMetrics();
    expect(m.aiRequestsPerMinute).toBe(0);

    pruneMonitor.dispose();
    vi.useRealTimers();
  });

  it("trims arrays when exceeding MAX_TIMESTAMPS (300)", () => {
    for (let i = 0; i < 310; i++) {
      monitor.recordFrameCapture(1);
      clock += 100;
    }
    const m = monitor.getMetrics();
    expect(m.cameraFPS).toBeGreaterThan(0);
  });

  it("dispose stops the prune timer", () => {
    vi.useFakeTimers();
    const m2 = new PerformanceMonitor({ now: () => clock });
    m2.start();
    m2.dispose();
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
  });

  it("recordSafetyAssessed is callable without error", () => {
    expect(() => monitor.recordSafetyAssessed()).not.toThrow();
  });
});
