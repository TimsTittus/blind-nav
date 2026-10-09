/**
 * Same-conditions latency comparison: loads the shortlisted candidates in one
 * process and runs them round-robin on every image (rotating the order), so
 * power-state or thermal drift affects all candidates equally. Reports medians
 * and each candidate's latency relative to the reference.
 *
 *   bun scripts/interleaved.ts [--threads 4] [--rounds 2]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { RawImage } from "@huggingface/transformers";
import { candidateByKey } from "../src/candidates";
import { imagePath, loadManifest, RESULTS_DIR } from "../src/dataset";
import { loadRunner, type Runner } from "../src/runners";
import { argValue, percentile } from "../src/stats";

const SHORTLIST = [
  "dfine-n-fp32",
  "dfine-n-q8",
  "rfdetr-nano-q8",
  "dfine-s-q8",
  "rtdetrv2-r18-q8",
  "seaformer-s-ade-fp32-512",
  "seaformer-s-ade-fp32-384",
  "segformer-b0-ade-fp32-512",
  "segformer-b0-ade-fp32-384",
  "depth-anything-v2-s-fp32-266",
  "depth-anything-v2-s-fp32-518",
];
const REFERENCE = "seaformer-s-ade-fp32-512";

const threads = Number(argValue("--threads") ?? 4);
const rounds = Number(argValue("--rounds") ?? 2);
const { images } = await loadManifest();
const decoded = await Promise.all(
  images.map((i) => RawImage.read(imagePath(i.id))),
);

const runners = new Map<string, Runner>();
for (const key of SHORTLIST) {
  const runner = await loadRunner(candidateByKey(key), threads);
  const first = decoded[0];
  if (first) {
    await runner.run(first);
    await runner.run(first);
  }
  runners.set(key, runner);
}

const timings = new Map<string, number[]>(SHORTLIST.map((k) => [k, []]));
let rotation = 0;
for (let round = 0; round < rounds; round++) {
  for (const img of decoded) {
    const order = SHORTLIST.map(
      (_, i) => SHORTLIST[(i + rotation) % SHORTLIST.length] ?? "",
    );
    rotation++;
    for (const key of order) {
      const r = await runners.get(key)?.run(img);
      if (r) timings.get(key)?.push(r.pre + r.model + r.post);
    }
  }
}

const refMedian = percentile(timings.get(REFERENCE) ?? [], 50);
const rows = SHORTLIST.map((key) => {
  const t = timings.get(key) ?? [];
  const median = percentile(t, 50);
  return {
    key,
    threads,
    samples: t.length,
    medianMs: median,
    p95Ms: percentile(t, 95),
    relativeToReference: Math.round((median / refMedian) * 100) / 100,
  };
});
console.table(rows);
await mkdir(RESULTS_DIR, { recursive: true });
await writeFile(
  `${RESULTS_DIR}/interleaved-t${threads}.json`,
  JSON.stringify({ reference: REFERENCE, rounds, rows }, null, 2) + "\n",
);
