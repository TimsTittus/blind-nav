/**
 * Scores saved model outputs (results/raw/*-t4.json) against the hand labels
 * and against the fixture-set safety floors.
 *
 *   bun scripts/evaluate.ts
 *
 * Rule "v1" thresholds were fixed before any scoring. Rule "v2" was designed
 * after inspecting v1 failures on this same image set, so its scores here are
 * optimistic and need held-out validation.
 */
import { readFile, writeFile } from "node:fs/promises";
import type { SafetyLevel } from "@/core";
import { sceneAnalysis } from "@/evaluation/helpers";
import { MUST_NOT_BE_SAFE, SAFETY_FLOOR } from "@/evaluation/types";
import { normalizeSceneObservation } from "@/providers/normalize";
import { SafetyEngine } from "@/safety";
import {
  loadManifest,
  QUESTIONS,
  RESULTS_DIR,
  type ManifestImage,
} from "../src/dataset";
import {
  answersFromDepth,
  answersFromDetection,
  answersFromSegmentation,
  answersFromSegmentationV2,
  detectionsInCorridor,
  fuse,
  segEvidence,
  type FastAnswers,
} from "../src/fast-answers";
import {
  toSceneObservation,
  type LocalEvidence,
} from "../src/local-observation";
import type {
  BenchmarkRecord,
  DepthOutput,
  RawOutput,
  SegmentationOutput,
} from "../src/raw-output";

type Rule = "v1" | "v2";
interface Config {
  keys: string[];
  rule: Rule;
}

const SEA = "seaformer-s-ade-fp32-512";
const SEA384 = "seaformer-s-ade-fp32-384";
const SEG = "segformer-b0-ade-fp32-512";
const RFDETR = "rfdetr-nano-q8";
const DFINE_S = "dfine-s-q8";
const DEPTH = "depth-anything-v2-s-fp32-266";

const v1 = (...keys: string[]): Config => ({ keys, rule: "v1" });
const v2 = (...keys: string[]): Config => ({ keys, rule: "v2" });

const ACCURACY_CONFIGS: Config[] = [
  // Single models, a-priori rule.
  ...[
    SEA,
    SEA384,
    "seaformer-s-ade-q8-512",
    SEG,
    "segformer-b0-ade-fp32-384",
    "segformer-b0-ade-q8-512",
  ].map((k) => v1(k)),
  ...[
    RFDETR,
    DFINE_S,
    "rtdetrv2-r18-q8",
    "yolos-tiny-q8",
    "dfine-n-fp32",
    "dfine-n-q8",
  ].map((k) => v1(k)),
  ...[DEPTH, "depth-anything-v2-s-fp32-518", "depth-anything-v2-s-q8-518"].map(
    (k) => v1(k),
  ),
  // Combinations, a-priori rule.
  v1(SEA, RFDETR),
  v1(SEA, DFINE_S),
  v1(SEA, RFDETR, DEPTH),
  v1(SEG, RFDETR),
  // Post-hoc rule.
  v2(SEA),
  v2(SEA384),
  v2(SEG),
  v2(SEA, DEPTH),
  v2(SEA, RFDETR, DEPTH),
  v2(SEG, RFDETR, DEPTH),
];

const SAFETY_CONFIGS: Config[] = [
  v1(SEA),
  v1(SEA, RFDETR),
  v1(SEG, RFDETR),
  v2(SEA, RFDETR),
  v2(SEA, RFDETR, DEPTH),
  v2(SEG, RFDETR, DEPTH),
];

/** Which error direction is the dangerous one for each question. */
const DANGEROUS: Record<(typeof QUESTIONS)[number], "FN" | "FP"> = {
  somethingAhead: "FN",
  blocked: "FN",
  sidewalk: "FP",
  stairs: "FN",
  largeObstacle: "FN",
  traversable: "FP",
};

const cache = new Map<string, Map<string, RawOutput>>();
async function outputsFor(key: string): Promise<Map<string, RawOutput>> {
  const hit = cache.get(key);
  if (hit) return hit;
  const record = JSON.parse(
    await readFile(`${RESULTS_DIR}/raw/${key}-t4.json`, "utf8"),
  ) as BenchmarkRecord;
  const map = new Map(record.images.map((i) => [i.id, i.output]));
  cache.set(key, map);
  return map;
}

async function evidenceFor(config: Config, id: string): Promise<LocalEvidence> {
  const outs = await Promise.all(
    config.keys.map(async (k) => (await outputsFor(k)).get(id)),
  );
  const seg =
    outs.find((o): o is SegmentationOutput => o?.kind === "segmentation") ??
    null;
  const depth = outs.find((o): o is DepthOutput => o?.kind === "depth") ?? null;
  const sources: FastAnswers[] = [];
  let detections: LocalEvidence["detections"] = [];
  for (const out of outs) {
    if (!out) continue;
    if (out.kind === "segmentation") {
      sources.push(
        config.rule === "v2"
          ? answersFromSegmentationV2(out, depth)
          : answersFromSegmentation(out),
      );
    } else if (out.kind === "detection") {
      sources.push(answersFromDetection(out));
      detections = detectionsInCorridor(out);
    } else if (config.rule === "v1" || !seg) {
      // Under v2, depth is consumed inside the segmentation rule.
      sources.push(answersFromDepth(out));
    }
  }
  return {
    answers: fuse(sources),
    seg: seg ? segEvidence(seg) : null,
    detections,
  };
}

const label = (c: Config) => `[${c.rule}] ${c.keys.join(" + ")}`;

async function scoreConfig(config: Config, images: ManifestImage[]) {
  const rows = Object.fromEntries(
    QUESTIONS.map((q) => [
      q,
      { tp: 0, fp: 0, fn: 0, tn: 0, unanswered: 0, dangerousErrors: 0 },
    ]),
  ) as Record<
    (typeof QUESTIONS)[number],
    {
      tp: number;
      fp: number;
      fn: number;
      tn: number;
      unanswered: number;
      dangerousErrors: number;
    }
  >;
  const dangerousErrorList: string[] = [];
  for (const img of images) {
    const { answers } = await evidenceFor(config, img.id);
    for (const q of QUESTIONS) {
      const s = rows[q];
      const predicted = answers[q];
      const truth = img.labels[q];
      if (predicted === null) {
        s.unanswered++;
        continue;
      }
      if (predicted && truth) s.tp++;
      else if (predicted && !truth) s.fp++;
      else if (!predicted && truth) s.fn++;
      else s.tn++;
      const dangerous =
        predicted !== truth &&
        ((DANGEROUS[q] === "FN" && truth) || (DANGEROUS[q] === "FP" && !truth));
      if (dangerous) {
        s.dangerousErrors++;
        dangerousErrorList.push(`${img.id}:${q}`);
      }
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const summary = Object.fromEntries(
    QUESTIONS.map((q) => {
      const s = rows[q];
      const answered = s.tp + s.fp + s.fn + s.tn;
      return [
        q,
        {
          ...s,
          accuracy: answered ? r2((s.tp + s.tn) / answered) : null,
          recall: s.tp + s.fn ? r2(s.tp / (s.tp + s.fn)) : null,
          precision: s.tp + s.fp ? r2(s.tp / (s.tp + s.fp)) : null,
        },
      ];
    }),
  );
  return { config: label(config), summary, dangerousErrorList };
}

const RANK: Record<SafetyLevel, number> = {
  unknown: 0,
  safe: 1,
  caution: 2,
  danger: 3,
  critical: 4,
};

async function safetyComparison(config: Config, images: ManifestImage[]) {
  const engine = new SafetyEngine();
  const now = 1_000_000;
  const ctx = (analysis: ReturnType<typeof sceneAnalysis>) => ({
    sceneAnalysis: analysis,
    location: null,
    heading: null,
    route: null,
    currentRouteStep: null,
    now,
  });
  const rows = [];
  for (const img of images) {
    const observation = toSceneObservation(await evidenceFor(config, img.id));
    const analysis = normalizeSceneObservation(observation, {
      capturedAt: now - 200,
      provider: "local",
      now: () => now,
    });
    const local = engine.assess(ctx(analysis)).assessment;
    const fixture = engine.assess(
      ctx(sceneAnalysis(img.fixture, now - 200, now)),
    ).assessment;
    const floor = SAFETY_FLOOR[img.fixture];
    rows.push({
      id: img.id,
      floor,
      fixtureLevel: fixture.level,
      localLevel: local.level,
      localAction: local.action,
      meetsFloor: RANK[local.level] >= RANK[floor],
      overStop:
        local.action === "stop" && floor !== "critical" && floor !== "danger",
      mustNotBeSafeViolation:
        MUST_NOT_BE_SAFE.includes(img.fixture) &&
        (local.level === "safe" || local.level === "unknown"),
    });
  }
  return {
    config: label(config),
    meetsFloor: rows.filter((r) => r.meetsFloor).length,
    fixtureMeetsFloor: rows.filter((r) => RANK[r.fixtureLevel] >= RANK[r.floor])
      .length,
    total: rows.length,
    saidSafe: rows.filter((r) => r.localLevel === "safe").length,
    unnecessaryStops: rows.filter((r) => r.overStop).map((r) => r.id),
    mustNotBeSafeViolations: rows
      .filter((r) => r.mustNotBeSafeViolation)
      .map((r) => r.id),
    belowFloor: rows
      .filter((r) => !r.meetsFloor)
      .map((r) => `${r.id} (${r.localLevel} < ${r.floor})`),
    rows,
  };
}

const { images } = await loadManifest();
const accuracy = [];
for (const c of ACCURACY_CONFIGS) accuracy.push(await scoreConfig(c, images));
const safety = [];
for (const c of SAFETY_CONFIGS) safety.push(await safetyComparison(c, images));

const fmt = (v: number | null) => (v === null ? "  - " : v.toFixed(2));
for (const r of accuracy) {
  console.log(`\n${r.config}`);
  for (const q of QUESTIONS) {
    const s = r.summary[q] as {
      tp: number;
      fp: number;
      fn: number;
      tn: number;
      unanswered: number;
      dangerousErrors: number;
      accuracy: number | null;
      recall: number | null;
      precision: number | null;
    };
    console.log(
      `  ${q.padEnd(15)} acc ${fmt(s.accuracy)} rec ${fmt(s.recall)} prec ${fmt(s.precision)} ` +
        `TP${s.tp} FP${s.fp} FN${s.fn} TN${s.tn} ?${s.unanswered} dangerous ${s.dangerousErrors}`,
    );
  }
}
for (const s of safety) {
  console.log(
    `\nSAFETY ${s.config}: meets floor ${s.meetsFloor}/${s.total} (fixture baseline ${s.fixtureMeetsFloor}/${s.total}), ` +
      `said SAFE ${s.saidSafe}, MUST_NOT_BE_SAFE violations ${s.mustNotBeSafeViolations.length}, ` +
      `STOP where floor < danger: ${s.unnecessaryStops.length}\n  below floor: ${s.belowFloor.join(", ")}\n  stops: ${s.unnecessaryStops.join(", ")}`,
  );
}
await writeFile(
  `${RESULTS_DIR}/evaluation.json`,
  JSON.stringify({ accuracy, safety }, null, 2) + "\n",
);
