export type Task =
  "object-detection" | "image-segmentation" | "depth-estimation";

export interface Candidate {
  key: string;
  task: Task;
  model: string;
  dtype: "fp32" | "q8";
  /** License of the upstream weights (checked on the Hugging Face model card). */
  license: string;
  /** Dataset the published weights were trained on (drives class coverage + data terms). */
  trainedOn: string;
  /**
   * Model input size (short side for depth, square for segmentation). When set,
   * the model is run directly (not via the pipeline) so post-processing stays at
   * model resolution and pre/model/post are timed separately.
   */
  inputSize?: number;
  /** Local ONNX file under models/ (exported by tools/export_seaformer.py); run with onnxruntime-node directly. */
  onnxFile?: string;
}

export const CANDIDATES: readonly Candidate[] = [
  // Object detection (COCO 80 classes: person, vehicles, bench, hydrant, ... no stairs/curb/pole).
  {
    key: "yolos-tiny-q8",
    task: "object-detection",
    model: "Xenova/yolos-tiny",
    dtype: "q8",
    license: "Apache-2.0",
    trainedOn: "COCO",
  },
  {
    key: "dfine-n-fp32",
    task: "object-detection",
    model: "onnx-community/dfine_n_coco-ONNX",
    dtype: "fp32",
    license: "Apache-2.0",
    trainedOn: "COCO",
  },
  {
    key: "dfine-n-q8",
    task: "object-detection",
    model: "onnx-community/dfine_n_coco-ONNX",
    dtype: "q8",
    license: "Apache-2.0",
    trainedOn: "COCO",
  },
  {
    key: "dfine-s-q8",
    task: "object-detection",
    model: "onnx-community/dfine_s_coco-ONNX",
    dtype: "q8",
    license: "Apache-2.0",
    trainedOn: "COCO",
  },
  {
    key: "rtdetrv2-r18-q8",
    task: "object-detection",
    model: "onnx-community/rtdetr_v2_r18vd-ONNX",
    dtype: "q8",
    license: "Apache-2.0",
    trainedOn: "COCO",
  },
  {
    key: "rfdetr-nano-q8",
    task: "object-detection",
    model: "onnx-community/rfdetr_nano-ONNX",
    dtype: "q8",
    license: "Apache-2.0",
    trainedOn: "COCO",
  },
  // Semantic segmentation (run directly; argmax at logit resolution).
  {
    key: "segformer-b0-ade-fp32-512",
    task: "image-segmentation",
    model: "Xenova/segformer-b0-finetuned-ade-512-512",
    dtype: "fp32",
    inputSize: 512,
    license: "NVIDIA Source Code License (non-commercial)",
    trainedOn: "ADE20K (150 classes)",
  },
  {
    key: "segformer-b0-ade-q8-512",
    task: "image-segmentation",
    model: "Xenova/segformer-b0-finetuned-ade-512-512",
    dtype: "q8",
    inputSize: 512,
    license: "NVIDIA Source Code License (non-commercial)",
    trainedOn: "ADE20K (150 classes)",
  },
  {
    key: "segformer-b0-ade-fp32-384",
    task: "image-segmentation",
    model: "Xenova/segformer-b0-finetuned-ade-512-512",
    dtype: "fp32",
    inputSize: 384,
    license: "NVIDIA Source Code License (non-commercial)",
    trainedOn: "ADE20K (150 classes)",
  },
  {
    key: "seaformer-s-ade-fp32-512",
    task: "image-segmentation",
    model: "fudan-zvg/SeaFormer (SeaFormer-S, exported)",
    dtype: "fp32",
    inputSize: 512,
    onnxFile: "seaformer_s_ade_512.onnx",
    license:
      "Apache-2.0 code; weights published without separate terms (ADE20K-trained)",
    trainedOn: "ADE20K (150 classes)",
  },
  {
    key: "seaformer-s-ade-q8-512",
    task: "image-segmentation",
    model: "fudan-zvg/SeaFormer (SeaFormer-S, exported)",
    dtype: "q8",
    inputSize: 512,
    onnxFile: "seaformer_s_ade_512_q8.onnx",
    license:
      "Apache-2.0 code; weights published without separate terms (ADE20K-trained)",
    trainedOn: "ADE20K (150 classes)",
  },
  {
    key: "seaformer-s-ade-fp32-384",
    task: "image-segmentation",
    model: "fudan-zvg/SeaFormer (SeaFormer-S, exported)",
    dtype: "fp32",
    inputSize: 384,
    onnxFile: "seaformer_s_ade_384.onnx",
    license:
      "Apache-2.0 code; weights published without separate terms (ADE20K-trained)",
    trainedOn: "ADE20K (150 classes)",
  },
  // Monocular relative depth (run directly; short side resized, multiple of 14).
  {
    key: "depth-anything-v2-s-fp32-518",
    task: "depth-estimation",
    model: "onnx-community/depth-anything-v2-small",
    dtype: "fp32",
    inputSize: 518,
    license: "Apache-2.0",
    trainedOn: "DA-2 synthetic + pseudo-labelled real",
  },
  {
    key: "depth-anything-v2-s-q8-518",
    task: "depth-estimation",
    model: "onnx-community/depth-anything-v2-small",
    dtype: "q8",
    inputSize: 518,
    license: "Apache-2.0",
    trainedOn: "DA-2 synthetic + pseudo-labelled real",
  },
  {
    key: "depth-anything-v2-s-fp32-266",
    task: "depth-estimation",
    model: "onnx-community/depth-anything-v2-small",
    dtype: "fp32",
    inputSize: 266,
    license: "Apache-2.0",
    trainedOn: "DA-2 synthetic + pseudo-labelled real",
  },
];

export function candidateByKey(key: string): Candidate {
  const found = CANDIDATES.find((c) => c.key === key);
  if (!found) throw new Error(`unknown candidate ${key}`);
  return found;
}
