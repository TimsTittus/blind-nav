import { vi } from "vitest";
import type { VisibilitySource } from "./visibility";

export class FakeTrack {
  enabled = true;
  stopped = false;
  private ended: Array<() => void> = [];
  constructor(
    readonly settings: MediaTrackSettings = {},
    readonly kind = "video",
  ) {}
  stop = vi.fn(() => {
    this.stopped = true;
  });
  getSettings = () => this.settings;
  addEventListener(type: string, listener: () => void) {
    if (type === "ended") this.ended.push(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    if (type === "ended") this.ended = this.ended.filter((l) => l !== listener);
  }
  /** Simulates the device being unplugged. */
  end() {
    this.ended.forEach((l) => l());
  }
}

export function fakeStream(settings: MediaTrackSettings = {}) {
  const track = new FakeTrack(settings);
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

export function domError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

export function fakeVideo() {
  return {
    srcObject: null as unknown,
    muted: false,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement & {
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  };
}

export function fakeVisibility() {
  let hidden = false;
  const listeners = new Set<() => void>();
  const source: VisibilitySource = {
    isHidden: () => hidden,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    source,
    listenerCount: () => listeners.size,
    setHidden(value: boolean) {
      hidden = value;
      listeners.forEach((l) => l());
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
