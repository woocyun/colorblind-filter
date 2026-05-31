// Loads a user file into an ImageBitmap with EXIF orientation already applied.
//
// `createImageBitmap(blob, { imageOrientation: 'from-image' })` bakes the EXIF
// rotation/flip into the pixels, so the rest of the app never has to think about
// orientation tags. Phone photos almost always carry these tags.

export interface LoadedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/i;

export function isProbablyImage(file: File): boolean {
  // Some browsers report HEIC with an empty type, so fall back to extension.
  if (file.type && ACCEPTED.test(file.type)) return true;
  if (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return true;
  // Be permissive: anything image/* is worth attempting.
  return /^image\//i.test(file.type);
}

export async function loadImage(file: File): Promise<LoadedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    // HEIC and a few edge formats can fail to decode in some browsers
    // (notably Chrome on Android lacks HEIC). Surface a clear message.
    throw new Error(
      `Could not decode this image. Your browser may not support its format (e.g. HEIC). (${
        (err as Error).message
      })`
    );
  }
  return { bitmap, width: bitmap.width, height: bitmap.height };
}
