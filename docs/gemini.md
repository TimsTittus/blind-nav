# Gemini vision provider — configuration

How the server-side Gemini vision provider is configured and called. This is the
first implementation of the replaceable `VisionProvider` interface
([ADR 0003](decisions.md)); everything here is **server-only**.

## SDK

- Package: **`@google/genai`** (the current official Google Gen AI JS/TS SDK).
- Client: `new GoogleGenAI({ apiKey })`.
- Call: `ai.models.generateContent({ model, contents, config })`.
- Structured output: `config.responseMimeType = "application/json"` plus
  `config.responseSchema` (built with the SDK's `Type` enum in
  [`src/providers/gemini/schema.ts`](../src/providers/gemini/schema.ts)).
- Image input: an inline part `{ inlineData: { mimeType, data } }`, where `data`
  is the base64 payload from the frame's `data:` URL.
- Result text: `response.text`, then `JSON.parse`, then **re-validated with Zod**
  (`SceneObservationSchema`) before use. The schema is belt-and-braces: even with
  structured output enabled, model JSON is never trusted directly.
- Latency/thinking: `config.temperature = 0` and
  `config.thinkingConfig = { thinkingBudget: 0 }` keep responses fast and
  observation-focused. A combined timeout + caller abort signal is passed via
  `config.abortSignal`.

> Model ids move quickly. Confirm the current recommended model against the
> official docs (https://ai.google.dev/gemini-api/docs) before changing the
> default. The default below is a current, multimodal, structured-output-capable
> flash model.

## Environment variables

Set these in `.env.local` (copy from [`.env.example`](../.env.example)). They are
read only on the server, validated by
[`src/config/server-env.ts`](../src/config/server-env.ts), and must never use the
`NEXT_PUBLIC_` prefix.

| Variable          | Required        | Default            | Purpose                                             |
| ----------------- | --------------- | ------------------ | --------------------------------------------------- |
| `GEMINI_API_KEY`  | prod: yes       | —                  | Gemini API key (server-only).                       |
| `GEMINI_MODEL`    | no              | `gemini-2.5-flash` | Model id used by the provider.                      |
| `VISION_FIXTURES` | no (dev-only)   | —                  | `1`/`true` forces the fixture provider in dev.      |

Get a key from Google AI Studio: https://aistudio.google.com/apikey

## Provider selection

Chosen per request in
[`resolve-provider.ts`](../src/app/api/vision/analyze/resolve-provider.ts):

- **Production:** always the real Gemini provider. If `GEMINI_API_KEY` is
  missing, requests fail with a typed `ai_error` (`AI_UNAVAILABLE`) — never a
  fake "path clear".
- **Development / test:** the canned **fixture** provider is used when
  `VISION_FIXTURES` is truthy, when the request carries `?provider=fixture`, or
  when no `GEMINI_API_KEY` is set — so you can run the whole pipeline with no key.

## Fixture mode (development)

Fixtures let the pipeline and UI be exercised in each meaningful state without a
camera or a key. Scenes: `clear`, `puddle`, `obstacle`, `stairs`, `blocked`,
`uncertain` (see [`fixtures.ts`](../src/providers/fixture/fixtures.ts)).

```bash
# Pick a fixture scene per request with ?scenario=…
curl -s localhost:3000/api/vision/analyze?scenario=stairs \
  -H 'content-type: application/json' \
  -d '{"sequence":0,"frame":{"dataUrl":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/","capturedAt":1700000000000},"context":{"mode":"navigate"}}'
```

## The endpoint

`POST /api/vision/analyze` — request/response contract in
[`src/perception/analyze-contract.ts`](../src/perception/analyze-contract.ts).

- **Request:** `{ frame: { dataUrl, capturedAt, width?, height? }, sequence, context? }`.
- **Success (200):** `{ ok: true, sequence, analysis: SceneAnalysis, latencyMs }`.
- **Failure:** `{ ok: false, sequence, error: SerializedAppError, perceptionStatus: "unavailable" }`
  with an HTTP status derived from the error code.

The browser never calls Gemini directly: it posts the frame to this endpoint and
the server calls the provider.

## Error mapping

The project-named error states map onto the shared typed taxonomy
([ADR 0012](decisions.md), [`core/errors.ts`](../src/core/errors.ts)):

| Named state            | `code`                   | HTTP | Raised when                              |
| ---------------------- | ------------------------ | ---- | ---------------------------------------- |
| `INVALID_IMAGE`        | `invalid_image`          | 400  | Missing/malformed/oversized/bad-MIME.    |
| `AI_RATE_LIMITED`      | `rate_limited`           | 429  | Provider HTTP 429.                       |
| `AI_TIMEOUT`           | `timeout`                | 504  | Abort / HTTP 408 / 504.                  |
| `AI_UNAVAILABLE`       | `ai_error`               | 502  | Provider 5xx / not configured / other.   |
| `NETWORK_ERROR`        | `network`                | 502  | Transport failure reaching the provider. |
| `INVALID_AI_RESPONSE`  | `invalid_model_response` | 502  | Model returned non-JSON / invalid shape. |

On any failure `perceptionStatus` is `unavailable`; the client's
`PerceptionController` clears the last analysis so nothing downstream can mistake
stale or absent data for a confirmed clear path.
