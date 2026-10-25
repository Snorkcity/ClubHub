import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe, useLeaveTeam,
} from "@workspace/api-client-react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export function TeamMembershipSettings() {
  const { data: me } = useGetMe();
  const leave = useLeaveTeam();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState("");
  const memberships = me?.memberships ?? [];
  const teams = Array.from(new Map(memberships.map((m) => [m.teamId, { id: m.teamId, name: m.teamName }])).values());
  if (!teams.length) return null;

  const confirm = async () => {
    if (!selected || leave.isPending) return;
    setError("");
    try {
      await leave.mutateAsync({ teamId: selected.id });
      // Full reload discards old roster, chat, monitoring and active-team state.
      // The access gate then opens another available club, or the no-team screen.
      localStorage.removeItem("clubhub.activeTeamId");
      queryClient.clear();
      toast({ title: `You left ${selected.name}` });
      window.location.assign(`${import.meta.env.BASE_URL}home`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't leave this team. Please try again.");
    }
  };

  return (
    <Card className="space-y-5 rounded-3xl p-6 md:p-8" data-testid="team-membership-settings">
      <div>
        <h2 className="text-xl font-bold">Your teams</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Teams you belong to in this club. Leaving does not delete your Nahreo account or past records.
        </p>
      </div>
      <div className="divide-y rounded-2xl border">
        {teams.map((team) => (
          <div key={team.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <span className="min-w-0 break-words font-semibold">{team.name}</span>
            <Button variant="outline" className="min-h-12 shrink-0 rounded-xl px-4"
              onClick={() => { setError(""); setSelected(team); }}
              aria-label={`Leave ${team.name}`}>
              <LogOut className="mr-2 h-4 w-4" /> Leave team
            </Button>
          </div>
        ))}
      </div>
      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => {
        if (!open && !leave.isPending) { setSelected(null); setError(""); }
      }}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {selected?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3" asChild>
              <div>
                <p>You will lose access to this team&apos;s updates, schedule and chats. Your past attendance, minutes, feedback and messages will not be deleted.</p>
                <p>Your other teams will stay unchanged. If this is your last team in this club, you will also leave the club, unless you still need access for a linked child.</p>
                <p>You will need a new invitation to rejoin. Your Nahreo account stays active.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel disabled={leave.isPending} className="min-h-12 rounded-xl">Stay in team</AlertDialogCancel>
            <Button variant="destructive" disabled={leave.isPending} onClick={() => void confirm()} className="min-h-12 rounded-xl">
              {leave.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Leave team
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
