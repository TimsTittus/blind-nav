import { describe, expect, it } from "vitest";
import { DuplicateSuppression } from "./duplicate-suppression";

const COOLDOWNS = {
  critical: 100,
  high: 200,
  navigation: 300,
  information: 400,
  low: 500,
} as const;

describe("DuplicateSuppression", () => {
  it("does not suppress the first occurrence", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    expect(ds.isSuppressed("hello", 0)).toBe(false);
  });

  it("suppresses duplicate within cooldown", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("hello", "low", 0);
    expect(ds.isSuppressed("hello", 100)).toBe(true);
    expect(ds.isSuppressed("hello", 499)).toBe(true);
  });

  it("allows duplicate after cooldown expires", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("hello", "low", 0);
    expect(ds.isSuppressed("hello", 500)).toBe(false);
  });

  it("uses priority-specific cooldown", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("alert", "critical", 0);
    expect(ds.isSuppressed("alert", 50)).toBe(true);
    expect(ds.isSuppressed("alert", 100)).toBe(false);
  });

  it("tracks different texts independently", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("a", "low", 0);
    ds.record("b", "low", 0);
    expect(ds.isSuppressed("a", 100)).toBe(true);
    expect(ds.isSuppressed("c", 100)).toBe(false);
  });

  it("clear removes all cooldowns", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("a", "low", 0);
    ds.record("b", "high", 0);
    ds.clear();
    expect(ds.isSuppressed("a", 0)).toBe(false);
    expect(ds.isSuppressed("b", 0)).toBe(false);
  });

  it("prune removes expired entries", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("old", "critical", 0); // expires at 100
    ds.record("fresh", "low", 90); // expires at 590
    ds.prune(200);
    expect(ds.isSuppressed("old", 200)).toBe(false);
    expect(ds.isSuppressed("fresh", 200)).toBe(true);
  });

  it("re-recording extends the cooldown", () => {
    const ds = new DuplicateSuppression(COOLDOWNS);
    ds.record("hello", "low", 0); // expires at 500
    ds.record("hello", "low", 400); // expires at 900
    expect(ds.isSuppressed("hello", 600)).toBe(true);
    expect(ds.isSuppressed("hello", 900)).toBe(false);
  });
});
