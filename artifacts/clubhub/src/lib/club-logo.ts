import { apiImageUrl } from "./team-banner";

export function clubLogoUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.startsWith("/api/") ? apiImageUrl(url) : url;
}

/** Preserve the whole logo and its transparency; never crop it like an avatar. */
export async function fileToClubLogoDataUrl(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Please choose an image smaller than 20 MB.");
  if (file.type && (!file.type.startsWith("image/") || file.type === "image/svg+xml"))
    throw new Error("Please choose a PNG, JPEG or WebP logo.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be opened. Try a PNG or JPEG."));
      image.src = url;
    });
    const scale = Math.min(1, 512 / image.naturalWidth, 512 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.split(",")[1].length * 0.75 > 1024 * 1024)
      throw new Error("This logo is still too large. Please choose a simpler or smaller image.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
