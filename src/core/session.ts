import { z } from "zod";
import {
  DestinationSchema,
  HeadingStateSchema,
  LocationStateSchema,
  RouteSchema,
} from "./navigation";
import { PerceptionStatusSchema } from "./perception";
import { EpochMillisSchema, UuidSchema } from "./primitives";
import { SafetyAssessmentSchema } from "./safety";

export const SessionModeSchema = z.enum(["navigate", "explore"]);

export const SessionStatusSchema = z.enum(["active", "stopped", "completed"]);

export const NavigationSessionSchema = z.object({
  id: UuidSchema,
  createdAt: EpochMillisSchema,
  updatedAt: EpochMillisSchema,
  mode: SessionModeSchema,
  status: SessionStatusSchema,
  destination: DestinationSchema.optional(),
  location: LocationStateSchema.optional(),
  heading: HeadingStateSchema.optional(),
  route: RouteSchema.optional(),
  perception: PerceptionStatusSchema,
  safety: SafetyAssessmentSchema,
});

export type SessionMode = z.infer<typeof SessionModeSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type NavigationSession = z.infer<typeof NavigationSessionSchema>;

export const CreateSessionInputSchema = z.object({
  mode: SessionModeSchema,
  destination: DestinationSchema.optional(),
  id: UuidSchema.optional(),
  now: EpochMillisSchema.optional(),
});

export type CreateSessionInput = z.input<typeof CreateSessionInputSchema>;

export function createSession(input: CreateSessionInput): NavigationSession {
  const { mode, destination, id, now } = CreateSessionInputSchema.parse(input);
  const createdAt = now ?? Date.now();
  const sessionId = id ?? crypto.randomUUID();

  return NavigationSessionSchema.parse({
    id: sessionId,
    createdAt,
    updatedAt: createdAt,
    mode,
    status: "active",
    ...(destination ? { destination } : {}),
    perception: {
      availability: "unavailable",
      detail: "Perception has not started.",
    },
    safety: {
      level: "unknown",
      reasons: ["No perception yet; safety is unknown."],
      assessedAt: createdAt,
      degraded: true,
    },
  });
}

function withStatus(
  session: NavigationSession,
  status: SessionStatus,
  now?: number,
): NavigationSession {
  return { ...session, status, updatedAt: now ?? Date.now() };
}

export function stopSession(
  session: NavigationSession,
  now?: number,
): NavigationSession {
  return withStatus(session, "stopped", now);
}

export function completeSession(
  session: NavigationSession,
  now?: number,
): NavigationSession {
  return withStatus(session, "completed", now);
}

export function isSessionActive(session: NavigationSession): boolean {
  return session.status === "active";
}
