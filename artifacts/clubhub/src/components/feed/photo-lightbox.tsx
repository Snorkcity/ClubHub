import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { apiImageUrl } from "@/lib/team-banner";

/**
 * Full-screen photo viewer (mobile-first). Swipe left/right on touch,
 * arrow keys / on-screen arrows on desktop, Esc or tap-outside to close.
 */
export function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: { id: number; url: string }[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const prev = useCallback(
    () => setIndex((i) => (i > 0 ? i - 1 : i)),
    [],
  );
  const next = useCallback(
    () => setIndex((i) => (i < photos.length - 1 ? i + 1 : i)),
    [photos.length],
  );

  // Keyboard navigation + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Horizontal swipe: navigate. Downward swipe: close (common mobile gesture).
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={apiImageUrl(photos[index].url)}
        alt={`Photo ${index + 1} of ${photos.length}`}
        className="max-h-full max-w-full object-contain select-none"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />

      <button
        type="button"
        aria-label="Close photo viewer"
        className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-6 w-6" />
      </button>

      {photos.length > 1 && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
            {index + 1} / {photos.length}
          </div>
          {index > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 max-sm:hidden"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 max-sm:hidden"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
