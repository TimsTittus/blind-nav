# `providers/` — replaceable AI vision provider abstraction

The seam that keeps the AI vision model **replaceable**. Perception talks to one
narrow interface; concrete providers implement it.

**Responsibilities (future phases)**

- Define a single `VisionProvider` interface: given a frame (+ minimal context),
  return a **validated** partial Scene Representation, or a typed failure.
- Provide concrete implementations behind that interface:
  - Google Gemini via the official `@google/genai` SDK with **structured JSON
    output**, validated with Zod.
  - Later: OpenRouter models, local object detection, semantic segmentation,
    depth estimation, dedicated CV models — added without touching callers.
- Normalize every provider's output into the `core` schema; reject anything
  that doesn't validate.

**Rules — critical**

- Provider code is **server-only**. API keys live in server env vars and must
  never reach client/browser code or `NEXT_PUBLIC_*`. Browser code calls an
  internal route handler (`src/app/api/**`); the route handler calls the
  provider.
- The application **never trusts arbitrary model-generated JSON**. All output is
  parsed through Zod; parse failures are a handled failure state, not a crash.
- A provider supplies perception input only. It does **not** decide navigation,
  safety, or any application action.
