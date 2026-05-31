import { applyFilter, Matrix3 } from './colorMath';

// Caps for the on-screen preview. The export paths always use full resolution;
// only the live working canvas is downscaled so getImageData/putImageData stays
// smooth during slider drags. Phones get a tighter cap.
const DESKTOP_PREVIEW_MAX_PIXELS = 6_000_000; // ~6MP
const MOBILE_PREVIEW_MAX_PIXELS = 2_000_000; // ~2MP

export function previewScale(
  width: number,
  height: number,
  isMobile: boolean
): number {
  const cap = isMobile ? MOBILE_PREVIEW_MAX_PIXELS : DESKTOP_PREVIEW_MAX_PIXELS;
  const pixels = width * height;
  if (pixels <= cap) return 1;
  return Math.sqrt(cap / pixels);
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Draws a divider centered at x. Black outer (8px) with a white interior (4px),
// both centered on x. Sizes scale up for high-resolution exports so the line
// stays visible.
export function drawDivider(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  scale = 1
): void {
  const blackW = Math.max(8, Math.round(8 * scale));
  const whiteW = Math.max(4, Math.round(4 * scale));
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.round(x - blackW / 2), 0, blackW, height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(Math.round(x - whiteW / 2), 0, whiteW, height);
}

// Holds a downscaled working copy of the image plus cached original and filtered
// pixel buffers, so re-compositing the split for a new slider position is cheap
// (no re-filtering). Call setMatrix() only when the matrix actually changes.
export class PreviewRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  private original: ImageData;
  private filtered: ImageData;

  constructor(bitmap: ImageBitmap, scale: number) {
    this.width = Math.max(1, Math.round(bitmap.width * scale));
    this.height = Math.max(1, Math.round(bitmap.height * scale));
    this.canvas = newCanvas(this.width, this.height);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    ctx.drawImage(bitmap, 0, 0, this.width, this.height);
    this.original = ctx.getImageData(0, 0, this.width, this.height);
    // Starts as a copy of the original; setMatrix() fills in the real filter.
    this.filtered = new ImageData(
      new Uint8ClampedArray(this.original.data),
      this.width,
      this.height
    );
  }

  setMatrix(m: Matrix3): void {
    this.filtered.data.set(this.original.data);
    applyFilter(this.filtered, m);
  }

  // Composites original (left of splitX) and filtered (right of splitX) with the
  // divider drawn on top. splitFraction is 0..1 across the image width.
  compose(splitFraction: number): void {
    const splitX = Math.round(this.width * splitFraction);
    this.ctx.putImageData(this.original, 0, 0);
    if (splitX < this.width) {
      this.ctx.putImageData(
        this.filtered,
        0,
        0,
        splitX,
        0,
        this.width - splitX,
        this.height
      );
    }
    drawDivider(this.ctx, splitX, this.height, 1);
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92
    );
  });
}

// Full-resolution export with the filter applied to the entire frame.
export async function exportFiltered(
  bitmap: ImageBitmap,
  m: Matrix3
): Promise<Blob> {
  const canvas = newCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  applyFilter(img, m);
  ctx.putImageData(img, 0, 0);
  return canvasToJpegBlob(canvas);
}

// Full-resolution comparison export: left half original, right half filtered,
// always split exactly at the centerline (ignores the on-screen slider).
export async function exportComparison(
  bitmap: ImageBitmap,
  m: Matrix3
): Promise<Blob> {
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const original = ctx.getImageData(0, 0, w, h);
  const filtered = new ImageData(new Uint8ClampedArray(original.data), w, h);
  applyFilter(filtered, m);

  const mid = Math.round(w / 2);
  ctx.putImageData(original, 0, 0);
  ctx.putImageData(filtered, 0, 0, mid, 0, w - mid, h);
  // Scale divider relative to image width so it reads on big exports.
  const dividerScale = Math.max(1, w / 1000);
  drawDivider(ctx, mid, h, dividerScale);
  return canvasToJpegBlob(canvas);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
