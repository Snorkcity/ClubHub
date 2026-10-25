import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClubMark } from "@/components/brand/club-mark";
import { fileToClubLogoDataUrl } from "@/lib/club-logo";

export function ClubLogoPicker({ value, onChange, disabled = false, onBusyChange }: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const busy = disabled || processing;

  async function choose(file?: File) {
    if (!file) return;
    setProcessing(true);
    onBusyChange?.(true);
    setError("");
    try {
      onChange(await fileToClubLogoDataUrl(file));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not process this logo.");
    } finally {
      setProcessing(false);
      onBusyChange?.(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3" data-testid="club-logo-picker">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border bg-muted/20 p-3">
          <ClubMark logoUrl={value} name="Club" className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input id={id} ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} disabled={busy} aria-label="Choose club logo" onChange={event => void choose(event.target.files?.[0])} />
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy} onClick={() => input.current?.click()}>
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
            {processing ? "Preparing logo…" : value ? "Change logo" : "Upload club logo"}
          </Button>
          {value && <Button type="button" variant="ghost" className="min-h-11 rounded-xl" disabled={busy} onClick={() => { setError(""); onChange(null); }}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">Optional. Choose a logo from your device. The whole image is kept, including transparent backgrounds.</p>
      {!value && <p className="text-xs text-muted-foreground">Skip for now by continuing without a logo. Nahreo will be shown until you add one.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
