import { describe, expect, it } from "vitest";
import {
  bearingBetween,
  distanceToSegment,
  haversineDistance,
} from "./geo-math";

describe("haversineDistance", () => {
  it("returns 0 for same point", () => {
    const p = { lat: 40.7128, lng: -74.006 };
    expect(haversineDistance(p, p)).toBeCloseTo(0, 0);
  });

  it("computes a known distance (NYC to LA ~3940 km)", () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const d = haversineDistance(nyc, la);
    expect(d).toBeGreaterThan(3_900_000);
    expect(d).toBeLessThan(4_000_000);
  });

  it("computes short walking distance (~111 m for 0.001 degree lat)", () => {
    const a = { lat: 40.0, lng: -74.0 };
    const b = { lat: 40.001, lng: -74.0 };
    const d = haversineDistance(a, b);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe("bearingBetween", () => {
  it("returns ~0 for due north", () => {
    const from = { lat: 40.0, lng: -74.0 };
    const to = { lat: 41.0, lng: -74.0 };
    const b = bearingBetween(from, to);
    expect(b).toBeCloseTo(0, 0);
  });

  it("returns ~90 for due east", () => {
    const from = { lat: 0.0, lng: 0.0 };
    const to = { lat: 0.0, lng: 1.0 };
    const b = bearingBetween(from, to);
    expect(b).toBeCloseTo(90, 0);
  });

  it("returns ~180 for due south", () => {
    const from = { lat: 41.0, lng: -74.0 };
    const to = { lat: 40.0, lng: -74.0 };
    const b = bearingBetween(from, to);
    expect(b).toBeCloseTo(180, 0);
  });

  it("returns ~270 for due west", () => {
    const from = { lat: 0.0, lng: 1.0 };
    const to = { lat: 0.0, lng: 0.0 };
    const b = bearingBetween(from, to);
    expect(b).toBeCloseTo(270, 0);
  });
});

describe("distanceToSegment", () => {
  it("returns 0 when point is on the segment start", () => {
    const a = { lat: 40.0, lng: -74.0 };
    const b = { lat: 40.001, lng: -74.0 };
    expect(distanceToSegment(a, a, b)).toBeCloseTo(0, 0);
  });

  it("returns distance to nearest endpoint when projection falls outside", () => {
    const start = { lat: 40.0, lng: -74.0 };
    const end = { lat: 40.001, lng: -74.0 };
    const farPoint = { lat: 39.999, lng: -74.0 };
    const d = distanceToSegment(farPoint, start, end);
    const dToStart = haversineDistance(farPoint, start);
    expect(d).toBeCloseTo(dToStart, 0);
  });

  it("returns small distance for a point near the middle of a segment", () => {
    const start = { lat: 40.0, lng: -74.0 };
    const end = { lat: 40.002, lng: -74.0 };
    const mid = { lat: 40.001, lng: -74.0001 };
    const d = distanceToSegment(mid, start, end);
    expect(d).toBeLessThan(15);
  });

  it("handles zero-length segment", () => {
    const p = { lat: 40.0, lng: -74.0 };
    const q = { lat: 40.001, lng: -74.0 };
    const d = distanceToSegment(q, p, p);
    expect(d).toBeCloseTo(haversineDistance(q, p), 0);
  });
});
