import { useState } from "react";
import { NahreoMark } from "./nahreo-logo";
import { clubLogoUrl } from "@/lib/club-logo";

export function ClubMark({ logoUrl, name, className = "h-8 w-8 shrink-0" }: {
  logoUrl?: string | null;
  name?: string;
  className?: string;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const src = clubLogoUrl(logoUrl);
  return src && brokenUrl !== src ? (
    <img src={src} alt={`${name || "Club"} logo`} className={`${className} object-contain`} onError={() => setBrokenUrl(src)} />
  ) : <NahreoMark className={className} />;
}
