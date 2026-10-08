import type { SpeechPriority } from "@/core";
import { DUPLICATE_COOLDOWN_MS } from "./config";

interface CooldownEntry {
  expiresAt: number;
}

export class DuplicateSuppression {
  private cooldowns = new Map<string, CooldownEntry>();
  private cooldownOverrides: Record<SpeechPriority, number> | null;

  constructor(cooldownOverrides?: Record<SpeechPriority, number>) {
    this.cooldownOverrides = cooldownOverrides ?? null;
  }

  isSuppressed(text: string, now: number): boolean {
    const entry = this.cooldowns.get(text);
    if (entry === undefined) return false;
    if (now >= entry.expiresAt) {
      this.cooldowns.delete(text);
      return false;
    }
    return true;
  }

  record(text: string, priority: SpeechPriority, now: number): void {
    const cooldownMs = this.cooldownOverrides
      ? this.cooldownOverrides[priority]
      : DUPLICATE_COOLDOWN_MS[priority];
    this.cooldowns.set(text, { expiresAt: now + cooldownMs });
  }

  clear(): void {
    this.cooldowns.clear();
  }

  prune(now: number): void {
    for (const [key, entry] of this.cooldowns) {
      if (now >= entry.expiresAt) {
        this.cooldowns.delete(key);
      }
    }
  }
}
