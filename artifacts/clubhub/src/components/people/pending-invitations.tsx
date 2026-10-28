import { SignOutButton } from "@clerk/react";
import { useAcceptPendingTeamInvitation, type PendingTeamInvitations } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { switchClub } from "@/lib/active-club";
import { clearTeamInvitation } from "@/lib/team-invitation";

export function PendingInvitations({ data, standalone = false }: {
  data: PendingTeamInvitations;
  standalone?: boolean;
}) {
  const accept = useAcceptPendingTeamInvitation();
  if (!data.invitations.length) return null;

  const content = (
    <section
      aria-label="Unfinished team invitations"
      className="shrink-0 border-b border-primary/20 bg-background p-4 md:px-8"
      data-testid="pending-team-invitations"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-lg font-bold">Finish joining your team</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in, but your invitation still needs to be accepted.
          You can finish here—there&apos;s no need to open an invitation email.
        </p>
        {data.invitations.map((invitation) => (
          <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold break-words">{invitation.teamName}</p>
              <p className="text-sm text-muted-foreground break-words">
                {invitation.clubName} · {invitation.role === "guardian" ? "Parent / Guardian" : invitation.role}
              </p>
            </div>
            <Button
              className="min-h-11 shrink-0 whitespace-normal"
              disabled={accept.isPending}
              onClick={() => accept.mutate({ invitationId: invitation.id }, {
                onSuccess: (result) => {
                  clearTeamInvitation();
                  switchClub(result.clubId);
                },
              })}
            >
              {accept.isPending && accept.variables?.invitationId === invitation.id
                ? "Joining…" : "Accept invitation and join"}
            </Button>
          </div>
        ))}
        {accept.error && <p role="alert" className="text-sm text-destructive">
          {(accept.error as any)?.data?.error ?? "We couldn't complete the invitation. Please try again."}
        </p>}
        {standalone && <SignOutButton>
          <button className="min-h-11 text-sm font-semibold text-primary">Sign out to use another account</button>
        </SignOutButton>}
      </div>
    </section>
  );

  return standalone
    ? <main className="min-h-[100dvh] overflow-y-auto bg-muted/20 py-8">{content}</main>
    : content;
}
