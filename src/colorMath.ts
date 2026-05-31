// Color math for the colorblindness simulator.
//
// Pipeline per pixel:
//   1. sRGB (0..1) -> linear light          (LUT: SRGB_TO_LINEAR)
//   2. linear RGB multiplied by M_combined  (3x3 matrix)
//   3. linear -> sRGB                        (LUT: LINEAR_TO_SRGB)
//   4. clip to [0,1], write back as 8-bit
//
// The two gamma conversions are the expensive part, so we precompute 256-entry
// lookup tables instead of calling Math.pow per channel per pixel.

export type Matrix3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

// EnChroma-style full-severity simulation matrices (operate in linear RGB).
const M_PROTAN_FULL: Matrix3 = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

const M_DEUTAN_FULL: Matrix3 = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];

const M_TRITAN_FULL: Matrix3 = [
  [1.255528, -0.076749, -0.178779],
  [-0.078411, 0.930809, 0.147602],
  [0.004733, 0.691367, 0.3039],
];

const IDENTITY: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// --- Lookup tables (256 entries each) ---

function buildSrgbToLinear(): Float32Array {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
}

// Maps a quantized linear value (0..LUT_SIZE-1) back to an 8-bit sRGB value.
// We quantize linear light to LINEAR_LUT_SIZE buckets so the reverse gamma
// conversion is also a table lookup rather than a per-pixel pow.
const LINEAR_LUT_SIZE = 4096;

function buildLinearToSrgb(): Uint8ClampedArray {
  const t = new Uint8ClampedArray(LINEAR_LUT_SIZE);
  for (let i = 0; i < LINEAR_LUT_SIZE; i++) {
    const c = i / (LINEAR_LUT_SIZE - 1);
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    t[i] = Math.round(s * 255);
  }
  return t;
}

const SRGB_TO_LINEAR = buildSrgbToLinear();
const LINEAR_TO_SRGB = buildLinearToSrgb();

// --- Matrix helpers ---

function lerpMatrix(full: Matrix3, severity: number): Matrix3 {
  // M_partial = (1 - s) * I + s * M_full
  const out: Matrix3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r][c] = (1 - severity) * IDENTITY[r][c] + severity * full[r][c];
    }
  }
  return out;
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const out: Matrix3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return out;
}

export interface ConeScores {
  // 0..100, where 100 = full sensitivity (no deficiency), 0 = cone absent.
  red: number;
  green: number;
  blue: number;
}

// Severity s = 1 - score/100, so 100% -> 0 (identity) and 0% -> 1 (full sim).
function severity(score: number): number {
  return 1 - score / 100;
}

export function computeCombinedMatrix(scores: ConeScores): Matrix3 {
  const protan = lerpMatrix(M_PROTAN_FULL, severity(scores.red));
  const deutan = lerpMatrix(M_DEUTAN_FULL, severity(scores.green));
  const tritan = lerpMatrix(M_TRITAN_FULL, severity(scores.blue));

  // Compose so protan is applied first, then deutan, then tritan.
  // For a column-vector convention (v' = M v) that means the leftmost factor
  // is the LAST transform applied, so:
  //   M_combined = M_tritan @ M_deutan @ M_protan
  // Order matters — do not "simplify" by reordering these factors.
  return multiply(tritan, multiply(deutan, protan));
}

// Applies the full filter pipeline in place on an ImageData buffer.
export function applyFilter(image: ImageData, m: Matrix3): void {
  const data = image.data;
  const s2l = SRGB_TO_LINEAR;
  const l2s = LINEAR_TO_SRGB;
  const maxIdx = LINEAR_LUT_SIZE - 1;

  const m00 = m[0][0],
    m01 = m[0][1],
    m02 = m[0][2];
  const m10 = m[1][0],
    m11 = m[1][1],
    m12 = m[1][2];
  const m20 = m[2][0],
    m21 = m[2][1],
    m22 = m[2][2];

  for (let i = 0; i < data.length; i += 4) {
    const lr = s2l[data[i]];
    const lg = s2l[data[i + 1]];
    const lb = s2l[data[i + 2]];

    let r = m00 * lr + m01 * lg + m02 * lb;
    let g = m10 * lr + m11 * lg + m12 * lb;
    let b = m20 * lr + m21 * lg + m22 * lb;

    // Clip linear to [0,1] then quantize into the reverse-gamma LUT.
    r = r < 0 ? 0 : r > 1 ? 1 : r;
    g = g < 0 ? 0 : g > 1 ? 1 : g;
    b = b < 0 ? 0 : b > 1 ? 1 : b;

    data[i] = l2s[(r * maxIdx) | 0];
    data[i + 1] = l2s[(g * maxIdx) | 0];
    data[i + 2] = l2s[(b * maxIdx) | 0];
    // alpha (i+3) left untouched
  }
}

export function formatMatrix(m: Matrix3): string {
  return m
    .map((row) => row.map((v) => v.toFixed(6).padStart(10)).join('  '))
    .join('\n');
}
