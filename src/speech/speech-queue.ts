import type { SpeechPriority } from "@/core";
import { SPEECH_PRIORITY_RANK } from "./config";

export interface QueueEntry {
  readonly id: string;
  readonly text: string;
  readonly priority: SpeechPriority;
  readonly createdAt: number;
}

function rank(priority: SpeechPriority): number {
  return SPEECH_PRIORITY_RANK[priority];
}

function canInterrupt(
  incoming: SpeechPriority,
  current: SpeechPriority,
): boolean {
  const i = rank(incoming);
  const c = rank(current);

  if (i === 0) return true;
  if (i === 1) return c >= 2;
  if (i === 2) return c >= 4;
  return false;
}

export class SpeechQueue {
  private entries: QueueEntry[] = [];
  private currentEntry: QueueEntry | null = null;

  get current(): QueueEntry | null {
    return this.currentEntry;
  }

  get pending(): readonly QueueEntry[] {
    return this.entries;
  }

  get length(): number {
    return this.entries.length;
  }

  enqueue(entry: QueueEntry): { shouldInterrupt: boolean } {
    if (
      this.currentEntry !== null &&
      canInterrupt(entry.priority, this.currentEntry.priority)
    ) {
      this.entries.unshift(entry);
      return { shouldInterrupt: true };
    }

    const insertIndex = this.entries.findIndex(
      (e) => rank(e.priority) > rank(entry.priority),
    );
    if (insertIndex === -1) {
      this.entries.push(entry);
    } else {
      this.entries.splice(insertIndex, 0, entry);
    }
    return { shouldInterrupt: false };
  }

  dequeue(): QueueEntry | undefined {
    const entry = this.entries.shift();
    if (entry !== undefined) {
      this.currentEntry = entry;
    }
    return entry;
  }

  markDone(): void {
    this.currentEntry = null;
  }

  clear(): void {
    this.entries = [];
    this.currentEntry = null;
  }
}
