import { Link, useLocation } from "wouter";
import { Show } from "@clerk/react";
import {
  getPreviewTeamInvitationQueryKey,
  useAcceptTeamInvitation,
  usePreviewTeamInvitation,
} from "@workspace/api-client-react";
import { NahreoBrand } from "@/components/brand/nahreo-logo";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/states";

export default function JoinTeam() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const preview = usePreviewTeamInvitation(
    { token },
    {
      query: {
        enabled: !!token,
        retry: false,
        queryKey: getPreviewTeamInvitationQueryKey({ token }),
      },
    },
  );
  const accept = useAcceptTeamInvitation();
  const redirect = `/join?token=${encodeURIComponent(token)}`;

  if (preview.isLoading) return <LoadingScreen message="Checking invitation…" />;

  if (!token || preview.error || !preview.data) {
    return (
      <main className="min-h-[100dvh] bg-muted/20 px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
          <NahreoBrand className="mx-auto mb-8 justify-center text-2xl" />
          <h1 className="font-display text-2xl font-bold">Invitation unavailable</h1>
          <p className="mt-3 text-muted-foreground">
            This invitation is invalid, expired, or has been replaced. Ask your
            club administrator for a new link.
          </p>
          <Button asChild className="mt-6 rounded-xl"><Link href="/">Go to Nahreo</Link></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-muted/20 px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
        <NahreoBrand className="mx-auto mb-8 justify-center text-2xl" />
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Team invitation
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">
          Join {preview.data.teamName}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Hi {preview.data.firstName}, you’ve been invited as a{" "}
          <strong>{preview.data.role}</strong>.
        </p>
        {preview.data.accepted ? (
          <Button onClick={() => setLocation("/home")} className="mt-7 w-full rounded-xl">
            Open Nahreo
          </Button>
        ) : (
          <>
            <Show when="signed-out">
              <div className="mt-7 space-y-3">
                <Button asChild className="w-full rounded-xl">
                  <Link href={`/sign-up?redirect_url=${encodeURIComponent(redirect)}`}>
                    Create account and join
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full rounded-xl">
                  <Link href={`/sign-in?redirect_url=${encodeURIComponent(redirect)}`}>
                    I already have an account
                  </Link>
                </Button>
              </div>
            </Show>
            <Show when="signed-in">
              <Button
                className="mt-7 w-full rounded-xl"
                disabled={accept.isPending}
                onClick={() =>
                  accept.mutate(
                    { data: { token } },
                    { onSuccess: (data) => setLocation(`/teams/${data.teamId}`) },
                  )
                }
              >
                {accept.isPending ? "Joining…" : "Complete invitation"}
              </Button>
              {accept.error && (
                <p className="mt-3 text-sm text-destructive">
                  {(accept.error as any)?.data?.error ??
                    "Sign in with the email address this invitation was sent to."}
                </p>
              )}
            </Show>
          </>
        )}
      </div>
    </main>
  );
}