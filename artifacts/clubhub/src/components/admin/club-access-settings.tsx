import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  getListClubSetupInvitationsQueryKey,
  getGetPlatformAccessQueryKey,
  useCreateClubSetupInvitation,
  useGetPlatformAccess,
  useListClubSetupInvitations,
  useRevokeClubSetupInvitation,
} from "@workspace/api-client-react";
import { switchClub } from "@/lib/active-club";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const statusLabels: Record<string, string> = {
  pending: "Pending",
  used: "Used",
  revoked: "Revoked",
  expired: "Expired",
};

export function ClubAccessSettings() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const accessQuery = useGetPlatformAccess({
    query: { enabled: isLoaded && Boolean(isSignedIn), queryKey: getGetPlatformAccessQueryKey(), staleTime: 0 },
  });
  const access = accessQuery.data;
  const isOwner = access?.isPlatformOwner === true;
  const invitationsQuery = useListClubSetupInvitations({
    query: {
      enabled: isOwner,
      queryKey: getListClubSetupInvitationsQueryKey(),
    },
  });
  const createInvitation = useCreateClubSetupInvitation();
  const revokeInvitation = useRevokeClubSetupInvitation();

  const [email, setEmail] = useState("");
  const [createError, setCreateError] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [copyFeedbackKind, setCopyFeedbackKind] = useState<"success" | "error" | "">("");
  const [revokeError, setRevokeError] = useState("");
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  if (!isLoaded || !isSignedIn) return null;

  const createLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    setCopyFeedback("");
    setCopyFeedbackKind("");
    setCreatedLink("");

    try {
      const result = await createInvitation.mutateAsync({ data: { email: email.trim() } });
      setCreatedLink(result.setupUrl);
      setEmail("");
      await queryClient.invalidateQueries({
        queryKey: getListClubSetupInvitationsQueryKey(),
      });
    } catch (error) {
      setCreateError(messageFor(error, "The setup link could not be created. Please try again."));
    }
  };

  const copyLink = async () => {
    const input = linkInputRef.current;
    if (!createdLink || !input) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(createdLink);
        setCopyFeedback("Setup link copied.");
        setCopyFeedbackKind("success");
        return;
      }
    } catch {
      // Try the legacy copy path below, then leave the selectable link in view.
    }

    input.focus();
    input.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    setCopyFeedback(copied
      ? "Setup link copied."
      : "Copy was unavailable. The link is selected below; copy it manually.");
    setCopyFeedbackKind(copied ? "success" : "error");
  };

  const revoke = async (invitationId: number) => {
    const invitation = invitationsQuery.data?.find((item) => item.id === invitationId);
    if (!invitation || !window.confirm(`Revoke the setup invitation for ${invitation.email}?`)) return;
    setRevokeError("");
    setRevokingId(invitationId);
    try {
      await revokeInvitation.mutateAsync({ invitationId });
      await queryClient.invalidateQueries({
        queryKey: getListClubSetupInvitationsQueryKey(),
      });
    } catch (error) {
      setRevokeError(messageFor(error, "That invitation could not be revoked. Please try again."));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="club-access-settings">
      {access?.clubs && access.clubs.length > 1 && (
        <Card className="space-y-5 rounded-3xl p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary">
              <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">Your clubs</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Choose which club you want to open. Your role is shown beside each club.
              </p>
            </div>
          </div>

          <div className="divide-y rounded-2xl border">
            {access.clubs.map((club) => (
              <div
                key={club.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">{club.name}</p>
                  <p className="mt-0.5 text-sm capitalize text-muted-foreground">
                    {club.role}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full shrink-0 rounded-xl sm:w-auto"
                  aria-label={`Switch to ${club.name}`}
                  onClick={() => switchClub(club.id)}
                >
                  <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden="true" />
                  Open {club.name}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {accessQuery.isLoading && (
        <Card className="flex min-h-24 items-center gap-3 rounded-3xl p-6" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading club access…</p>
        </Card>
      )}

      {accessQuery.error && (
        <Card className="space-y-4 rounded-3xl border-destructive/30 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Club access could not be loaded</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {messageFor(accessQuery.error, "Please check your connection and try again.")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-xl"
            onClick={() => void accessQuery.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </Card>
      )}

      {isOwner && (
        <Card
          className="space-y-6 rounded-3xl border-primary/20 bg-primary/[0.025] p-6 md:p-8"
          data-testid="nahreo-administration"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                Nahreo administration
              </p>
              <h2 className="mt-1 text-xl font-display font-bold">Club setup invitations</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Create a one-time setup link for a new club administrator. Links are not emailed;
                copy and share each one yourself.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border bg-background p-4 sm:p-5">
            <form className="space-y-4" onSubmit={createLink}>
              <div className="space-y-2">
                <Label htmlFor="club-setup-email">Administrator email</Label>
                <Input
                  id="club-setup-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="h-12 rounded-xl"
                  aria-describedby="club-setup-email-help"
                />
                <p id="club-setup-email-help" className="text-xs leading-relaxed text-muted-foreground">
                  The link is bound to this verified email address and expires after 7 days.
                </p>
              </div>
              <Button
                type="submit"
                className="min-h-11 w-full rounded-xl sm:w-auto"
                disabled={createInvitation.isPending || !email.trim()}
              >
                {createInvitation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserRoundPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {createInvitation.isPending ? "Creating link…" : "Create setup link"}
              </Button>
            </form>

            {createError && (
              <p className="mt-4 flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {createError}
              </p>
            )}

            {createdLink && (
              <div className="mt-5 space-y-3 border-t pt-5" aria-live="polite">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Setup link created
                </div>
                <Label htmlFor="created-setup-link">Copy and share this link</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="created-setup-link"
                    ref={linkInputRef}
                    readOnly
                    value={createdLink}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-12 min-w-0 rounded-xl font-mono text-xs"
                    aria-label="New club setup link; selectable text"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 shrink-0 rounded-xl"
                    onClick={() => void copyLink()}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copy link
                  </Button>
                </div>
                <p
                  className={`text-sm ${
                    copyFeedbackKind === "success"
                      ? "text-primary"
                      : copyFeedbackKind === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                  role="status"
                >
                  {copyFeedback || "This link is shown only now. Save or share it before leaving this page."}
                </p>
              </div>
            )}
          </div>

          <section aria-labelledby="invitation-list-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="invitation-list-heading" className="font-semibold">Invitation status</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only pending invitations can be revoked. Setup links are not retained here.
                </p>
              </div>
              {invitationsQuery.isError && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10 rounded-xl"
                  onClick={() => void invitationsQuery.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Retry
                </Button>
              )}
            </div>

            {revokeError && (
              <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {revokeError}
              </p>
            )}

            {invitationsQuery.isLoading ? (
              <div className="flex min-h-20 items-center gap-3 rounded-2xl border p-4" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">Loading invitation status…</span>
              </div>
            ) : invitationsQuery.isError ? (
              <div className="rounded-2xl border border-destructive/30 p-4 text-sm text-muted-foreground" role="alert">
                {messageFor(invitationsQuery.error, "Invitation status could not be loaded.")}
              </div>
            ) : invitationsQuery.data?.length ? (
              <div className="space-y-2">
                {invitationsQuery.data.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-3 rounded-2xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="break-all font-semibold">{invitation.email}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {statusLabels[invitation.status] ?? invitation.status}
                        </span>
                        {" · "}Created {formatDate(invitation.createdAt)}
                        {" · "}Expires {formatDate(invitation.expiresAt)}
                      </p>
                    </div>
                    {invitation.status === "pending" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full shrink-0 rounded-xl text-destructive hover:text-destructive sm:w-auto"
                        disabled={revokingId === invitation.id}
                        aria-label={`Revoke invitation for ${invitation.email}`}
                        onClick={() => void revoke(invitation.id)}
                      >
                        {revokingId === invitation.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <X className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-5 text-center">
                <p className="font-semibold">No invitations yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a setup link above when a new club is ready to join Nahreo.
                </p>
              </div>
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-background p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="font-semibold">Setting up another club yourself?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a new club setup in Nahreo.
              </p>
            </div>
            <Link
              href="/get-started?newClub=1"
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Create another club
              <ExternalLink className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
