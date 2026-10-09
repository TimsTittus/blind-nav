import { describe, expect, it } from "vitest";
import { PerformanceMonitor } from "./performance-monitor";

function monitorAt(clock: { t: number }): PerformanceMonitor {
  return new PerformanceMonitor({ now: () => clock.t });
}

describe("PerformanceMonitor — local inference metrics", () => {
  it("starts with no local measurements rather than zeroes that look real", () => {
    const metrics = monitorAt({ t: 0 }).getMetrics();
    expect(metrics.localLatencyMs).toBeNull();
    expect(metrics.localMedianLatencyMs).toBeNull();
    expect(metrics.localFPS).toBe(0);
  });

  it("records latency and its median", () => {
    const clock = { t: 1_000 };
    const monitor = monitorAt(clock);
    for (const [index, duration] of [40, 60, 80].entries()) {
      clock.t = 1_000 + index * 200;
      monitor.recordLocalInference(duration);
    }
    const metrics = monitor.getMetrics();
    expect(metrics.localLatencyMs).toBe(80);
    expect(metrics.localMedianLatencyMs).toBe(60);
  });

  it("computes a duty cycle from measured model time", () => {
    const clock = { t: 0 };
    const monitor = monitorAt(clock);
    // Four 250 ms inferences across one second of wall clock = fully busy.
    for (let i = 0; i < 4; i++) {
      clock.t = i * 250;
      monitor.recordLocalInference(250);
    }
    clock.t = 1_000;
    expect(monitor.getMetrics().localDutyCycle).toBe(1);
  });

  it("reports a low duty cycle when inference is cheap", () => {
    const clock = { t: 0 };
    const monitor = monitorAt(clock);
    for (let i = 0; i < 5; i++) {
      clock.t = i * 1_000;
      monitor.recordLocalInference(20);
    }
    clock.t = 5_000;
    expect(monitor.getMetrics().localDutyCycle).toBeLessThan(0.1);
  });

  it("tracks the local failure rate", () => {
    const clock = { t: 1_000 };
    const monitor = monitorAt(clock);
    monitor.recordLocalInference(30);
    monitor.recordLocalInference(30);
    monitor.recordLocalFailure();
    monitor.recordLocalFailure();
    expect(monitor.getMetrics().localFailureRate).toBe(0.5);
  });

  it("keeps cloud and local metrics separate", () => {
    const clock = { t: 1_000 };
    const monitor = monitorAt(clock);
    monitor.recordLocalInference(50);
    monitor.recordAiRequestEnd(clock.t - 800);
    const metrics = monitor.getMetrics();
    expect(metrics.localLatencyMs).toBe(50);
    expect(metrics.aiLatencyMs).toBe(800);
  });

  it("clears local measurements on reset", () => {
    const monitor = monitorAt({ t: 1_000 });
    monitor.recordLocalInference(50);
    monitor.reset();
    expect(monitor.getMetrics().localLatencyMs).toBeNull();
  });

  it("reports null heap where the browser does not expose it", () => {
    // jsdom has no `performance.memory`; guessing a number would be worse.
    expect(monitorAt({ t: 0 }).getMetrics().jsHeapMB).toBeNull();
  });
});
