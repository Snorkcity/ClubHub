import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { ArrowRight, KeyRound, UsersRound } from "lucide-react";
import { useJoinWithTeamCode, usePreviewTeamCode } from "@workspace/api-client-react";
import type { TeamCodeJoinInput, TeamCodeJoinResult, TeamCodePreview } from "@workspace/api-client-react";
import { NahreoBrand } from "@/components/brand/nahreo-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearPendingTeamCode, getTeamInvitationRedirect, savePendingTeamCode } from "@/lib/team-invitation";
import { switchClub } from "@/lib/active-club";

type JoinDraft = {
  firstName: string;
  lastName: string;
  role: "player" | "guardian";
  childName: string;
  status?: "pending" | "rejected";
};

function draftStorageKey(userId: string, code: string) {
  return `nahreo.teamJoinDraft:${userId}:${code.replace(/[\s-]/g, "").toUpperCase()}`;
}

function readJoinDraft(userId: string, code: string): JoinDraft | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(userId, code));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<JoinDraft>;
    if (
      typeof draft.firstName === "string" &&
      typeof draft.lastName === "string" &&
      (draft.role === "player" || draft.role === "guardian") &&
      typeof draft.childName === "string"
    ) return draft as JoinDraft;
  } catch {
    return null;
  }
  return null;
}

function writeJoinDraft(userId: string, code: string, draft: JoinDraft) {
  try {
    sessionStorage.setItem(draftStorageKey(userId, code), JSON.stringify(draft));
  } catch {
    // Joining remains usable if browser session storage is unavailable.
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "data" in error) {
    const message = (error as { data?: { error?: unknown } }).data?.error;
    if (typeof message === "string") return message;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function JoinTeamByCode() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const initialCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const [code, setCode] = useState(initialCode);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [role, setRole] = useState<"player" | "guardian">("player");
  const [childName, setChildName] = useState("");
  const [resultStatus, setResultStatus] = useState<"joined" | "pending" | "rejected" | null>(null);
  const [requestData, setRequestData] = useState<TeamCodeJoinInput | null>(null);
  const [shownPreview, setShownPreview] = useState<TeamCodePreview | null>(null);
  const preview = usePreviewTeamCode();
  const join = useJoinWithTeamCode();
  const initialPreviewDone = useRef(false);
  const cleanCode = code.replace(/[\s-]/g, "").toUpperCase();
  const teamPreview = shownPreview;

  useEffect(() => {
    if (!user?.id || !cleanCode) return;
    const draft = readJoinDraft(user.id, cleanCode);
    if (!draft) return;
    setFirstName(draft.firstName);
    setLastName(draft.lastName);
    setRole(draft.role);
    setChildName(draft.childName);
    const savedRequest: TeamCodeJoinInput = {
      code: cleanCode,
      firstName: draft.firstName,
      lastName: draft.lastName,
      role: draft.role,
      ...(draft.role === "guardian" ? { childName: draft.childName } : {}),
    };
    setRequestData(savedRequest);
    setResultStatus(draft.status ?? null);
  }, [user?.id, cleanCode]);

  useEffect(() => {
    if (user) {
      setFirstName((value) => value || user.firstName || "");
      setLastName((value) => value || user.lastName || "");
    }
  }, [user]);

  useEffect(() => {
    if (initialCode && !initialPreviewDone.current) {
      initialPreviewDone.current = true;
      preview.mutate({ data: { code: initialCode.trim().toUpperCase() } }, {
        onSuccess: (data) => setShownPreview(data),
      });
    }
  }, [initialCode]);

  function checkCode(event: FormEvent) {
    event.preventDefault();
    setShownPreview(null);
    setResultStatus(null);
    preview.reset();
    preview.mutate({ data: { code: cleanCode } }, {
      onSuccess: (data) => setShownPreview(data),
    });
  }

  function submitJoin(event?: FormEvent) {
    event?.preventDefault();
    if (resultStatus === "pending" && requestData) {
      executeJoin(requestData);
      return;
    }
    if (!cleanCode || !firstName.trim() || !lastName.trim() || (role === "guardian" && !childName.trim())) return;
    const data: TeamCodeJoinInput = {
      code: cleanCode,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      ...(role === "guardian" ? { childName: childName.trim() } : {}),
    };
    setRequestData(data);
    if (user?.id) writeJoinDraft(user.id, cleanCode, { firstName: data.firstName, lastName: data.lastName, role: data.role, childName: data.childName ?? "" });
    executeJoin(data);
  }

  function executeJoin(data: TeamCodeJoinInput) {
    join.reset();
    join.mutate({ data }, {
      onSuccess: (result: TeamCodeJoinResult) => {
        setResultStatus(result.status);
        if (result.status === "joined") {
          if (user?.id) {
            try { sessionStorage.removeItem(draftStorageKey(user.id, data.code)); } catch { /* ignore unavailable storage */ }
          }
          clearPendingTeamCode();
          switchClub(result.clubId, result.teamId);
        } else if (user?.id) {
          writeJoinDraft(user.id, data.code, {
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            childName: data.childName ?? "",
            status: result.status,
          });
        }
      },
    });
  }

  return (
    <main className="min-h-[100dvh] bg-muted/25 px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex justify-center"><NahreoBrand className="text-2xl" /></div>
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="border-b bg-primary/[0.045] px-6 py-7 sm:px-9">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Team access</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Join a team</h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Enter the reusable code your coach or club admin shared. Joining codes are for players; guardian requests are reviewed by staff.</p>
          </div>
          <div className="space-y-6 p-6 sm:p-9">
            <form onSubmit={checkCode} className="space-y-3">
              <Label htmlFor="team-code">Team code</Label>
              <div className="flex gap-2">
                <Input id="team-code" data-testid="input-team-code" value={code} onChange={(event) => { setCode(event.target.value); savePendingTeamCode(event.target.value); setShownPreview(null); setResultStatus(null); setRequestData(null); preview.reset(); join.reset(); }} autoCapitalize="characters" autoComplete="off" placeholder="Enter your code" className="h-12 rounded-xl font-mono tracking-[0.12em]" required />
                <Button data-testid="button-check-team-code" type="submit" disabled={!cleanCode || preview.isPending} className="h-12 shrink-0 rounded-xl px-5">{preview.isPending ? "Checking…" : "Check code"}</Button>
              </div>
              {(preview.error || (initialCode && !teamPreview && !preview.isPending)) && <p role="alert" className="text-sm text-destructive">{errorMessage(preview.error, "That code could not be found. Check it with your coach and try again.")}</p>}
            </form>

            {teamPreview && (
              <div className="flex items-start gap-4 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4" data-testid="team-code-preview">
                <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5" /></div>
                <div><p className="font-display text-lg font-bold">{teamPreview.teamName}</p><p className="text-sm text-muted-foreground">{teamPreview.clubName}</p></div>
              </div>
            )}

            <Show when="signed-out">
              <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-5">
                <p className="text-sm leading-relaxed text-muted-foreground">Sign in with an existing Nahreo account if you already use the app. If creating a new account, Continue with Google avoids a separate Nahreo verification email. Email and password sign-up still requires email verification.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild className="h-12 rounded-xl"><Link href={`/sign-in?redirect_url=${encodeURIComponent(getTeamInvitationRedirect() ?? `/join-team?code=${encodeURIComponent(cleanCode)}`)}`}>Continue to sign in <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                  <Button asChild variant="outline" className="h-12 rounded-xl"><Link href={`/sign-up?redirect_url=${encodeURIComponent(getTeamInvitationRedirect() ?? `/join-team?code=${encodeURIComponent(cleanCode)}`)}`}>Create an account</Link></Button>
                </div>
              </div>
            </Show>

            <Show when="signed-in">
              {resultStatus === "pending" ? (
                <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5" data-testid="status-team-join-pending">
                  <h2 className="font-display text-xl font-bold">Waiting for coach approval</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">Your guardian request for {requestData?.childName} is with the team staff. You won&apos;t have access to your child&apos;s reports until staff confirms the link.</p>
                  {join.error && <p role="alert" className="text-sm text-destructive">{errorMessage(join.error, "We couldn’t check access. Please try again.")}</p>}
                  <Button className="w-full rounded-xl" variant="outline" disabled={join.isPending} onClick={() => submitJoin()}>{join.isPending ? "Checking…" : "Check access"}</Button>
                  <p className="text-center text-xs text-muted-foreground">You can sign out or continue using your other teams while staff reviews it.</p>
                  <Button asChild variant="ghost" className="w-full"><Link href="/home">Continue to my other teams</Link></Button>
                  <Button variant="ghost" className="w-full" onClick={() => signOut({ redirectUrl: "/" })}>Sign out</Button>
                </div>
              ) : resultStatus === "rejected" ? (
                <div className="space-y-3 rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-5" data-testid="status-team-join-rejected">
                  <h2 className="font-display text-xl font-bold">Request not approved</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">The team staff could not approve this request. Contact the coach directly if you think this is a mistake.</p>
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => signOut({ redirectUrl: "/" })}>Sign out</Button>
                </div>
              ) : (
                <form onSubmit={submitJoin} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="join-first-name">First name</Label><Input id="join-first-name" data-testid="input-join-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={100} /></div>
                    <div className="space-y-2"><Label htmlFor="join-last-name">Last name</Label><Input id="join-last-name" data-testid="input-join-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={100} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="join-role">I am joining as</Label>
                    <select id="join-role" data-testid="select-join-role" value={role} onChange={(e) => setRole(e.target.value as "player" | "guardian")} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm">
                      <option value="player">A player</option><option value="guardian">A parent / guardian</option>
                    </select>
                  </div>
                  {role === "guardian" && <div className="space-y-2"><Label htmlFor="child-name">Child&apos;s name</Label><Input id="child-name" data-testid="input-child-name" value={childName} onChange={(e) => setChildName(e.target.value)} required maxLength={200} /><p className="text-xs leading-relaxed text-muted-foreground">A coach must confirm the child before they are added. This request does not create a public roster entry.</p></div>}
                  {join.error && <p role="alert" className="text-sm text-destructive">{errorMessage(join.error, "We couldn’t join this team. Please check the code and try again.")}</p>}
                  <Button data-testid="button-join-team" type="submit" className="h-12 w-full rounded-xl" disabled={join.isPending || !teamPreview}>{join.isPending ? "Sending request…" : role === "guardian" ? "Request guardian access" : "Join team"}</Button>
                </form>
              )}
            </Show>
            <p className="border-t pt-4 text-center text-xs leading-relaxed text-muted-foreground">Staff access is never granted by a reusable code. Coaches and managers are invited individually.</p>
          </div>
        </section>
        <div className="mt-5 text-center"><Link href="/" className="text-sm font-semibold text-primary hover:underline">Return to Nahreo</Link></div>
      </div>
    </main>
  );
}
