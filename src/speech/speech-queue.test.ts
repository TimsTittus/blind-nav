import { describe, expect, it } from "vitest";
import type { QueueEntry } from "./speech-queue";
import { SpeechQueue } from "./speech-queue";

function entry(
  text: string,
  priority: QueueEntry["priority"],
  id?: string,
): QueueEntry {
  return { id: id ?? text, text, priority, createdAt: Date.now() };
}

describe("SpeechQueue", () => {
  it("dequeues in FIFO order for same priority", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("a", "navigation"));
    q.enqueue(entry("b", "navigation"));
    q.enqueue(entry("c", "navigation"));
    expect(q.dequeue()?.text).toBe("a");
    expect(q.dequeue()?.text).toBe("b");
    expect(q.dequeue()?.text).toBe("c");
  });

  it("dequeues higher priority first", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("low", "low"));
    q.enqueue(entry("high", "high"));
    q.enqueue(entry("nav", "navigation"));
    expect(q.dequeue()?.text).toBe("high");
    expect(q.dequeue()?.text).toBe("nav");
    expect(q.dequeue()?.text).toBe("low");
  });

  it("returns undefined when empty", () => {
    const q = new SpeechQueue();
    expect(q.dequeue()).toBeUndefined();
  });

  it("critical interrupts everything", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("low", "low"));
    q.dequeue(); // now "low" is current
    const { shouldInterrupt } = q.enqueue(entry("crit", "critical"));
    expect(shouldInterrupt).toBe(true);
  });

  it("critical interrupts high", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("high", "high"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("crit", "critical"));
    expect(shouldInterrupt).toBe(true);
  });

  it("high interrupts navigation", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("nav", "navigation"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("high", "high"));
    expect(shouldInterrupt).toBe(true);
  });

  it("high interrupts information", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("info", "information"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("high", "high"));
    expect(shouldInterrupt).toBe(true);
  });

  it("high does not interrupt critical", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("crit", "critical"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("high", "high"));
    expect(shouldInterrupt).toBe(false);
  });

  it("navigation interrupts low", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("low", "low"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("nav", "navigation"));
    expect(shouldInterrupt).toBe(true);
  });

  it("navigation does not interrupt high", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("high", "high"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("nav", "navigation"));
    expect(shouldInterrupt).toBe(false);
  });

  it("low does not interrupt anything", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("info", "information"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("low", "low"));
    expect(shouldInterrupt).toBe(false);
  });

  it("information does not interrupt navigation", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("nav", "navigation"));
    q.dequeue();
    const { shouldInterrupt } = q.enqueue(entry("info", "information"));
    expect(shouldInterrupt).toBe(false);
  });

  it("does not interrupt when nothing is current", () => {
    const q = new SpeechQueue();
    const { shouldInterrupt } = q.enqueue(entry("crit", "critical"));
    expect(shouldInterrupt).toBe(false);
  });

  it("clear removes all entries and current", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("a", "low"));
    q.enqueue(entry("b", "high"));
    q.dequeue();
    q.clear();
    expect(q.length).toBe(0);
    expect(q.current).toBeNull();
    expect(q.dequeue()).toBeUndefined();
  });

  it("markDone clears current", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("a", "low"));
    q.dequeue();
    expect(q.current).not.toBeNull();
    q.markDone();
    expect(q.current).toBeNull();
  });

  it("interrupted entry is placed at front of queue", () => {
    const q = new SpeechQueue();
    q.enqueue(entry("low", "low"));
    q.dequeue(); // low is current
    q.enqueue(entry("crit", "critical")); // interrupts
    q.markDone();
    expect(q.dequeue()?.text).toBe("crit");
  });
});
