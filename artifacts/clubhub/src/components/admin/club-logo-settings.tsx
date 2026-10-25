import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useSetClubLogo, useDeleteClubLogo, getGetClubQueryKey, getGetClubOverviewQueryKey, type Club } from "@workspace/api-client-react";
import { ClubLogoPicker } from "./club-logo-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function ClubLogoSettings({ club }: { club: Club }) {
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const [processing, setProcessing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saved = (updated: Club) => {
    queryClient.setQueryData(getGetClubQueryKey(), updated);
    void queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
    setDraft(undefined);
    toast({ title: updated.logoUrl ? "Club logo updated" : "Club logo removed" });
  };
  const failed = () => toast({ title: "Could not save the club logo", description: "Your selection is still here. Please try again.", variant: "destructive" });
  const upload = useSetClubLogo({ mutation: { onSuccess: saved, onError: failed } });
  const remove = useDeleteClubLogo({ mutation: { onSuccess: saved, onError: failed } });
  const busy = processing || upload.isPending || remove.isPending;

  return (
    <Card className="space-y-5 rounded-3xl p-6 md:p-8" data-testid="club-logo-settings">
      <div>
        <h2 className="text-xl font-display font-bold">Club branding</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">The logo for {club.name}, shared by all your teams. Only club admins can change it. The phone app icon stays Nahreo.</p>
      </div>
      <ClubLogoPicker value={draft === undefined ? club.logoUrl ?? null : draft} onChange={setDraft} disabled={upload.isPending || remove.isPending} onBusyChange={setProcessing} />
      {draft !== undefined && (
        <div className="flex flex-wrap gap-3">
          <Button type="button" className="min-h-11 rounded-xl" disabled={busy} onClick={() => draft ? upload.mutate({ data: { imageData: draft } }) : remove.mutate()}>
            {upload.isPending || remove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save club logo
          </Button>
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</Button>
        </div>
      )}
    </Card>
  );
}
