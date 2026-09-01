import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2 } from "lucide-react";
import {
  useSetTeamBanner,
  useDeleteTeamBanner,
  getGetTeamQueryKey,
  getGetTeamSummaryQueryKey,
  getListTeamsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fileToBannerDataUrl } from "@/lib/team-banner";

/**
 * Coach/manager controls for the team photo banner: pick a photo (resized
 * client-side before upload) or remove the current one. Rendered over the
 * team header.
 */
export function TeamBannerEditor({
  teamId,
  hasBanner,
}: {
  teamId: number;
  hasBanner: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey(teamId) });
    queryClient.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(teamId) });
    queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
  };

  const setBanner = useSetTeamBanner({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Team photo updated" });
      },
      onError: () =>
        toast({ title: "Could not upload photo", variant: "destructive" }),
    },
  });
  const deleteBanner = useDeleteTeamBanner({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Team photo removed" });
      },
      onError: () =>
        toast({ title: "Could not remove photo", variant: "destructive" }),
    },
  });

  const busy = processing || setBanner.isPending || deleteBanner.isPending;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      const imageData = await fileToBannerDataUrl(file);
      setBanner.mutate({ teamId, data: { imageData } });
    } catch {
      toast({ title: "Could not read that image", variant: "destructive" });
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button
        size="sm"
        variant="secondary"
        className="rounded-xl bg-black/40 text-white border border-white/30 hover:bg-black/60 backdrop-blur"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Camera className="h-4 w-4 mr-1.5" />
        )}
        {hasBanner ? "Change photo" : "Add team photo"}
      </Button>
      {hasBanner && (
        <Button
          size="sm"
          variant="secondary"
          className="rounded-xl bg-black/40 text-white border border-white/30 hover:bg-black/60 backdrop-blur px-2.5"
          disabled={busy}
          onClick={() => deleteBanner.mutate({ teamId })}
          aria-label="Remove team photo"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
