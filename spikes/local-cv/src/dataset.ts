import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FixtureSceneId } from "@/providers/fixture/fixtures";

export const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
export const IMAGE_DIR = `${DATA_DIR}/images`;
export const RESULTS_DIR = fileURLToPath(
  new URL("../results", import.meta.url),
);

/** Ground truth for the six fast questions, judged for the walking corridor ahead. */
export interface FastLabels {
  somethingAhead: boolean;
  blocked: boolean;
  sidewalk: boolean;
  stairs: boolean;
  largeObstacle: boolean;
  traversable: boolean;
}

export const QUESTIONS = [
  "somethingAhead",
  "blocked",
  "sidewalk",
  "stairs",
  "largeObstacle",
  "traversable",
] as const satisfies readonly (keyof FastLabels)[];

export interface ManifestImage {
  id: string;
  fixture: FixtureSceneId;
  commonsTitle: string;
  labels: FastLabels;
}

export async function loadManifest(): Promise<{ images: ManifestImage[] }> {
  return JSON.parse(await readFile(`${DATA_DIR}/manifest.json`, "utf8")) as {
    images: ManifestImage[];
  };
}

export function imagePath(id: string): string {
  return `${IMAGE_DIR}/${id}.jpg`;
}
