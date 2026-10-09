/**
 * Benchmarks each candidate in its own child process (clean memory numbers) and
 * saves compact per-image outputs for `evaluate.ts`.
 *
 *   bun scripts/benchmark.ts [--threads 4] [key ...]
 *
 * Absolute timings depend on the host's power state; use `interleaved.ts` for a
 * same-conditions latency comparison.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { RawImage } from "@huggingface/transformers";
import { CANDIDATES, candidateByKey } from "../src/candidates";
import { imagePath, loadManifest, RESULTS_DIR } from "../src/dataset";
import type { BenchmarkRecord, ImageResult } from "../src/raw-output";
import { loadRunner, modelFileMB } from "../src/runners";
import { argValue, percentile, rssMB } from "../src/stats";

const RAW_DIR = `${RESULTS_DIR}/raw`;

async function runChild(key: string, threads: number): Promise<void> {
  const c = candidateByKey(key);
  const { images } = await loadManifest();
  const rssBaselineMB = rssMB();
  const tLoad = performance.now();
  const runner = await loadRunner(c, threads);
  const loadMs = Math.round(performance.now() - tLoad);
  const rssAfterLoadMB = rssMB();

  const first = images[0];
  if (!first) throw new Error("empty manifest");
  const warm = await RawImage.read(imagePath(first.id));
  const tCold = performance.now();
  await runner.run(warm);
  const coldInferenceMs = Math.round(performance.now() - tCold);
  await runner.run(warm);

  let rssPeakMB = rssMB();
  const results: ImageResult[] = [];
  const stages = {
    pre: [] as number[],
    model: [] as number[],
    post: [] as number[],
  };
  let inputShape: number[] = [];
  for (const item of images) {
    const r = await runner.run(await RawImage.read(imagePath(item.id)));
    stages.pre.push(r.pre);
    stages.model.push(r.model);
    stages.post.push(r.post);
    inputShape = r.shape;
    rssPeakMB = Math.max(rssPeakMB, rssMB());
    results.push({
      id: item.id,
      latencyMs: Math.round((r.pre + r.model + r.post) * 10) / 10,
      output: r.output,
    });
  }

  const latencies = results.map((r) => r.latencyMs);
  const record: BenchmarkRecord = {
    key: c.key,
    model: c.model,
    dtype: c.dtype,
    threads,
    modelFileMB: await modelFileMB(c),
    loadMs,
    coldInferenceMs,
    warmMedianMs: percentile(latencies, 50),
    warmP95Ms: percentile(latencies, 95),
    ...(c.task === "object-detection"
      ? {}
      : {
          stageMedianMs: {
            pre: percentile(stages.pre, 50),
            model: percentile(stages.model, 50),
            post: percentile(stages.post, 50),
          },
          inputShape,
        }),
    rssBaselineMB,
    rssAfterLoadMB,
    rssPeakMB,
    images: results,
  };
  await writeFile(
    `${RAW_DIR}/${c.key}-t${threads}.json`,
    JSON.stringify(record),
  );
  console.log(
    `${c.key} t=${threads}: file ${record.modelFileMB} MB, load ${loadMs} ms, cold ${coldInferenceMs} ms, ` +
      `median ${record.warmMedianMs} ms, p95 ${record.warmP95Ms} ms, RSS ${rssAfterLoadMB}->${rssPeakMB} MB`,
  );
}

async function runParent(): Promise<void> {
  const threads = Number(argValue("--threads") ?? 4);
  const keys = process.argv
    .slice(2)
    .filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--threads");
  const selected = keys.length > 0 ? keys.map(candidateByKey) : CANDIDATES;
  await mkdir(RAW_DIR, { recursive: true });
  for (const c of selected) {
    const proc = Bun.spawn(
      [
        "bun",
        fileURLToPath(import.meta.url),
        "--child",
        c.key,
        "--threads",
        String(threads),
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if ((await proc.exited) !== 0) console.error(`${c.key}: FAILED`);
  }
}

const child = argValue("--child");
if (child) await runChild(child, Number(argValue("--threads") ?? 4));
else await runParent();
