// In-browser benchmark: onnxruntime-web, WASM vs WebGPU execution providers.
import * as ort from "/ort/ort.all.min.mjs";

ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);

const IMAGENET = {
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  scale: 1 / 255,
};
const MMSEG = {
  mean: [123.675, 116.28, 103.53],
  std: [58.395, 57.12, 57.375],
  scale: 1,
};
const RESCALE_ONLY = { mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 };

const MODELS = [
  {
    key: "seaformer-s-512-fp32",
    url: "/models/seaformer_s_ade_512.onnx",
    w: 512,
    h: 512,
    norm: MMSEG,
    seg: true,
  },
  {
    key: "seaformer-s-384-fp32",
    url: "/models/seaformer_s_ade_384.onnx",
    w: 384,
    h: 384,
    norm: MMSEG,
    seg: true,
  },
  {
    key: "segformer-b0-512-fp32",
    url: "/hf/Xenova/segformer-b0-finetuned-ade-512-512/onnx/model.onnx",
    w: 512,
    h: 512,
    norm: IMAGENET,
    seg: true,
  },
  {
    key: "rfdetr-nano-384-fp32",
    url: "/hf/onnx-community/rfdetr_nano-ONNX/onnx/model.onnx",
    w: 384,
    h: 384,
    norm: RESCALE_ONLY,
  },
  {
    key: "rfdetr-nano-384-q8",
    url: "/hf/onnx-community/rfdetr_nano-ONNX/onnx/model_quantized.onnx",
    w: 384,
    h: 384,
    norm: RESCALE_ONLY,
  },
  {
    key: "dfine-s-640-q8",
    url: "/hf/onnx-community/dfine_s_coco-ONNX/onnx/model_quantized.onnx",
    w: 640,
    h: 640,
    norm: RESCALE_ONLY,
  },
  {
    key: "depth-anything-v2-s-266x350-fp32",
    url: "/hf/onnx-community/depth-anything-v2-small/onnx/model.onnx",
    w: 350,
    h: 266,
    norm: IMAGENET,
  },
];
const N_IMAGES = 8;
const ROUNDS = 2;

const status = (msg) => {
  document.getElementById("status").textContent = msg;
  console.log(`[bench] ${msg}`);
};

/** Software rasterisers make WebGPU timings meaningless; skip rather than mislead. */
function isSoftwareAdapter(info) {
  const text = JSON.stringify(info ?? "").toLowerCase();
  return /swiftshader|llvmpipe|lavapipe|software|cpu/.test(text);
}

async function loadImages() {
  const manifest = await (await fetch("/data/manifest.json")).json();
  const ids = manifest.images.slice(0, N_IMAGES).map((i) => i.id);
  return Promise.all(
    ids.map(async (id) =>
      createImageBitmap(await (await fetch(`/images/${id}.jpg`)).blob()),
    ),
  );
}

function toTensor(bitmap, w, h, norm) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const plane = w * h;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] =
        (rgba[i * 4 + c] * norm.scale - norm.mean[c]) / norm.std[c];
    }
  }
  return new ort.Tensor("float32", out, [1, 3, h, w]);
}

function argmax(logits) {
  const [, C, H, W] = logits.dims;
  const plane = H * W;
  const out = new Uint16Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0;
    let bestV = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = logits.data[c * plane + i];
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    out[i] = best;
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
};

async function benchModel(model, ep, inputs) {
  const t0 = performance.now();
  const session = await ort.InferenceSession.create(model.url, {
    executionProviders: [ep],
    graphOptimizationLevel: "all",
  });
  const createMs = Math.round(performance.now() - t0);
  const feedName = session.inputNames[0];
  const outName = session.outputNames[0];
  const coldStart = performance.now();
  await session.run({ [feedName]: inputs[0] });
  const coldMs = Math.round(performance.now() - coldStart);
  await session.run({ [feedName]: inputs[0] });
  const times = [];
  const argmaxes = [];
  for (let r = 0; r < ROUNDS; r++) {
    for (const input of inputs) {
      const t = performance.now();
      const result = await session.run({ [feedName]: input });
      times.push(performance.now() - t);
      if (model.seg && r === 0) argmaxes.push(argmax(result[outName]));
    }
  }
  await session.release();
  return {
    createMs,
    coldMs,
    medianMs: median(times),
    p95Ms:
      Math.round(
        times.sort((a, b) => a - b)[Math.ceil(times.length * 0.95) - 1] * 10,
      ) / 10,
    argmaxes,
  };
}

async function run() {
  const env = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    crossOriginIsolated: self.crossOriginIsolated,
    wasmThreads: ort.env.wasm.numThreads,
    webgpu: "gpu" in navigator,
    adapter: null,
  };
  if (env.webgpu) {
    const adapter = await navigator.gpu.requestAdapter();
    env.adapter = adapter
      ? adapter.info
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            description: adapter.info.description,
          }
        : "available"
      : null;
  }
  env.softwareAdapter = env.adapter ? isSoftwareAdapter(env.adapter) : null;
  status(`env ${JSON.stringify(env)}`);
  status("Loading images…");
  const bitmaps = await loadImages();
  const results = [];
  for (const model of MODELS) {
    const inputs = bitmaps.map((b) =>
      toTensor(b, model.w, model.h, model.norm),
    );
    const row = { key: model.key };
    let wasmArgmax = null;
    for (const ep of ["wasm", "webgpu"]) {
      if (ep === "webgpu" && !env.adapter) {
        row[ep] = { error: "no WebGPU adapter" };
        continue;
      }
      if (ep === "webgpu" && env.softwareAdapter) {
        row[ep] = { skipped: "software WebGPU adapter (not representative)" };
        continue;
      }
      status(`${model.key} on ${ep}…`);
      try {
        const r = await benchModel(model, ep, inputs);
        row[ep] = {
          createMs: r.createMs,
          coldMs: r.coldMs,
          medianMs: r.medianMs,
          p95Ms: r.p95Ms,
        };
        if (model.seg && ep === "wasm") wasmArgmax = r.argmaxes;
        if (model.seg && ep === "webgpu" && wasmArgmax) {
          let same = 0;
          let total = 0;
          r.argmaxes.forEach((a, i) => {
            const b = wasmArgmax[i];
            for (let j = 0; j < a.length; j++) {
              total++;
              if (a[j] === b[j]) same++;
            }
          });
          row.webgpuArgmaxAgreementWithWasm =
            Math.round((same / total) * 1000) / 1000;
        }
      } catch (error) {
        row[ep] = {
          error: String(error && error.message ? error.message : error).slice(
            0,
            300,
          ),
        };
      }
    }
    results.push(row);
    status(`result ${JSON.stringify(row)}`);
    document.getElementById("result").textContent = JSON.stringify(
      { env, results },
      null,
      2,
    );
  }
  window.__benchResult = { env, results };
  status("Done.");
}

document.getElementById("run").addEventListener("click", () => {
  run().catch((error) => {
    status(`Failed: ${error}`);
    window.__benchResult = { error: String(error) };
  });
});
