# `navigation/` — route & position reasoning

Owns **route/GPS** reasoning, kept deliberately separate from visual
perception. Supports Navigation Mode (go to a destination) and feeds context to
Explore Mode.

**Responsibilities (future phases)**

- Destination selection, route acquisition, and walking route guidance.
- Track current position and heading (Geolocation / device orientation) with
  explicit accuracy and freshness.
- Produce the next route instruction and reconcile it with reality:
  route instruction + current position + heading + traversable path.

**Rules**

- GPS/route information is a **separate input** from visual perception; the two
  are reconciled by the Decision Engine, not blended in perception.
- Navigation proposes route intent; it never bypasses the Safety Engine.
- Handle permission denial, signal loss, and stale fixes as explicit states,
  never as silent failures.
