# `perception/` — turning sensor input into a Scene Representation

Converts raw input (camera frames; later depth/other sensors) into the
validated **Scene Representation** defined in [`core/`](../core/README.md).

**Status: Phase 4 — the frame→AI→scene pipeline exists.** It is wired to the
camera at the `FrameConsumer` seam and fully unit-tested, but not yet mounted in
the live UI (see [`docs/architecture.md`](../../docs/architecture.md) §17).

**What's here**

- **Wire contract** (`analyze-contract.ts`): the request/response Zod schemas
  for `POST /api/vision/analyze`, shared by client and server (no provider SDK).
- **Image boundary** (`image.ts`): server-side `decodeImageDataUrl` validates
  MIME type and size before any model call; throws typed `InvalidImageError`.
- **Analysis client** (`analysis-client.ts`): browser-side `fetch` wrapper that
  posts a frame and returns the validated response; `blobToDataUrl` encodes a
  captured frame transiently.
- **Controller** (`perception-controller.ts` + pure `perception-state.ts`):
  issues **one analysis at a time**, coalesces newer frames into a single
  pending slot, tags each with a monotonic sequence, and applies results through
  a reducer that **drops any result older than the one already applied**.
  `dispose()` aborts in-flight work.
- **Bridge** (`perception-frame-consumer.ts`): adapts the camera's
  `FrameConsumer` to the controller.

**Rules**

- Perception **describes**; it never decides what the user should do. The
  model's `recommendedImmediateAction` is a hint only — the Safety Engine (later
  phase) owns risk and user-facing action.
- The AI provider is replaceable (Gemini today; OpenRouter / local object
  detection / segmentation / depth later) behind one interface in
  [`providers/`](../providers/README.md). Every result is re-validated with Zod.
- Freshness and availability are explicit, so downstream layers can tell a
  "clear path" from "we don't currently know". A failure forces `unavailable`
  and clears the last analysis — never a silent "path clear".
- Camera frames are processed transiently and not persisted (see privacy rules
  in [`docs/architecture.md`](../../docs/architecture.md)).
