/** Helpers for team photo banners. */

/**
 * Absolute URL for a team's signed banner path (Team.bannerUrl). Uses the
 * same base-URL logic as the API client (VITE_API_URL on Railway prod,
 * same-origin /api on Replit dev).
 */
export function teamBannerUrl(bannerUrl: string): string {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
  return `${base}${bannerUrl}`;
}

/** Absolute URL for any signed relative image path from the API (banners, post photos). */
export const apiImageUrl = teamBannerUrl;

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 900;
const JPEG_QUALITY = 0.82;

/**
 * Reads an image file, downsizes it to banner dimensions on a canvas and
 * returns a JPEG data URL — keeps upload payloads small (typically <300KB).
 */
export async function fileToBannerDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      MAX_WIDTH / bitmap.width,
      MAX_HEIGHT / bitmap.height,
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
