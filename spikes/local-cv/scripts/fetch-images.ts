import { mkdir, writeFile, access } from "node:fs/promises";
import { loadManifest, IMAGE_DIR, DATA_DIR } from "../src/dataset";

const UA = "blind-nav-research-spike/0.1 (local CV evaluation)";
const WIDTH = 1024;

interface ImageInfo {
  thumburl: string;
  descriptionurl: string;
  extmetadata: Record<string, { value: string } | undefined>;
}

async function getWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 20);
      console.warn(`429; waiting ${wait}s`);
      await Bun.sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return res;
  }
  throw new Error(`gave up on ${url}`);
}

function stripHtml(value: string | undefined): string {
  return (value ?? "unknown").replace(/<[^>]+>/g, "").trim();
}

const manifest = await loadManifest();
await mkdir(IMAGE_DIR, { recursive: true });
const attributions: string[] = [
  "# Test image attribution",
  "",
  "Images from Wikimedia Commons, used unmodified (resized on download) for local evaluation only.",
  "",
  "| id | file | author | license |",
  "| -- | ---- | ------ | ------- |",
];

for (const item of manifest.images) {
  const params = new URLSearchParams({
    format: "json",
    action: "query",
    titles: item.commonsTitle,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(WIDTH),
  });
  const meta = (await (
    await getWithRetry(`https://commons.wikimedia.org/w/api.php?${params}`)
  ).json()) as {
    query: { pages: Record<string, { imageinfo?: ImageInfo[] }> };
  };
  const info = Object.values(meta.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`no imageinfo for ${item.commonsTitle}`);

  const author = stripHtml(info.extmetadata["Artist"]?.value);
  const license = stripHtml(info.extmetadata["LicenseShortName"]?.value);
  attributions.push(
    `| ${item.id} | [${item.commonsTitle}](${info.descriptionurl}) | ${author} | ${license} |`,
  );

  const target = `${IMAGE_DIR}/${item.id}.jpg`;
  const exists = await access(target).then(
    () => true,
    () => false,
  );
  if (!exists) {
    const bytes = await (await getWithRetry(info.thumburl)).arrayBuffer();
    await writeFile(target, new Uint8Array(bytes));
    await Bun.sleep(1500);
  }
  console.log(`${item.id}: ${license}`);
}

await writeFile(`${DATA_DIR}/ATTRIBUTION.md`, attributions.join("\n") + "\n");
