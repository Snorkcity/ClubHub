import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, RefreshCw, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey, getGetTeamJoinCodeQueryKey, getGetTeamJoinRequestsQueryKey,
  getListPeopleQueryKey, useDisableTeamJoinCode, useGetTeamJoinCode,
  useGetTeamJoinRequests, useListPeople, useReviewTeamJoinRequest, useRotateTeamJoinCode,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Team = { id: number; name: string };

function apiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "data" in error) {
    const message = (error as { data?: { error?: unknown } }).data?.error;
    if (typeof message === "string") return message;
  }
  return error instanceof Error ? error.message : fallback;
}

export function TeamJoinAccess({ teams, initialTeamId }: { teams: Team[]; initialTeamId?: number }) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(initialTeamId ?? teams[0]?.id);
  const [copied, setCopied] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const teamIdsKey = teams.map((team) => team.id).join(",");
  const previousInitialTeamId = useRef(initialTeamId);
  const teamIds = teams.map((team) => team.id);
  const initialIsValid = initialTeamId != null && teamIds.includes(initialTeamId);
  const initialChanged = previousInitialTeamId.current !== initialTeamId;
  const teamId = initialChanged && initialIsValid
    ? initialTeamId
    : selectedTeamId != null && teamIds.includes(selectedTeamId)
      ? selectedTeamId
      : initialIsValid ? initialTeamId : teamIds[0];
  useEffect(() => {
    const didInitialChange = previousInitialTeamId.current !== initialTeamId;
    previousInitialTeamId.current = initialTeamId;
    if (didInitialChange && initialIsValid) {
      setSelectedTeamId(initialTeamId);
      setMessage("");
      setCopied(false);
      return;
    }
    if (selectedTeamId != null && !teamIds.includes(selectedTeamId)) {
      const fallback = initialTeamId != null && teamIds.includes(initialTeamId)
        ? initialTeamId
        : teamIds[0];
      setSelectedTeamId(fallback);
      setMessage("");
      setCopied(false);
    }
  }, [initialTeamId, teamIdsKey]);
  const queryClient = useQueryClient();
  const codeQuery = useGetTeamJoinCode(teamId ?? 0, { query: { enabled: !!teamId, queryKey: getGetTeamJoinCodeQueryKey(teamId ?? 0), staleTime: 0, refetchOnWindowFocus: true } });
  const requestsQuery = useGetTeamJoinRequests(teamId ?? 0, { query: { enabled: !!teamId, queryKey: getGetTeamJoinRequestsQueryKey(teamId ?? 0), staleTime: 10_000, refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const playersParams = { teamId, role: "player" as const };
  const playersQuery = useListPeople(playersParams, { query: { enabled: !!teamId, queryKey: getListPeopleQueryKey(playersParams) } });
  const rotate = useRotateTeamJoinCode();
  const disable = useDisableTeamJoinCode();
  const review = useReviewTeamJoinRequest();
  const code = codeQuery.data;
  const link = code?.link || (code?.code ? `${window.location.origin}${import.meta.env.BASE_URL}join-team?code=${encodeURIComponent(code.code)}` : "");

  async function copyText(text: string, description: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMessage(description);
    } catch {
      setCopied(false);
      setMessage("Clipboard access failed. Select and copy the code or link manually.");
    }
  }

  function refreshCode() {
    if (!teamId) return;
    if (code?.code && !window.confirm("Replace this team code? The current code and every shared link using it will stop working.")) return;
    setMessage("");
    rotate.mutate({ teamId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTeamJoinCodeQueryKey(teamId) });
        setCopied(false);
      },
      onError: (error) => setMessage(apiErrorMessage(error, "Could not create a new code. Try again.")),
    });
  }

  function disableCode() {
    if (!teamId || !window.confirm("Disable this team code? Anyone with the current code or link will no longer be able to use it.")) return;
    disable.mutate({ teamId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTeamJoinCodeQueryKey(teamId) });
        setMessage("The team code has been disabled.");
      },
      onError: (error) => setMessage(apiErrorMessage(error, "Could not disable the code. Try again.")),
    });
  }

  function decide(requestId: number, decision: "approve" | "reject") {
    if (!teamId) return;
    const selected = selectedPlayers[requestId];
    if (decision === "approve" && !selected) return;
    review.mutate({ teamId, requestId, data: { decision, ...(decision === "approve" ? { playerId: Number(selected) } : {}) } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTeamJoinRequestsQueryKey(teamId) });
        void queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (error) => setMessage(apiErrorMessage(error, "Could not review this request.")),
    });
  }

  return (
    <section className="mb-7 rounded-3xl border bg-card p-5 shadow-sm sm:p-6" data-testid="team-join-access">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 text-primary"><Link2 className="h-4 w-4" /><p className="text-xs font-bold uppercase tracking-[0.14em]">Reusable team access</p></div>
          <h2 className="mt-2 font-display text-xl font-bold">Join code & guardian requests</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Code holders can join as players. Staff are still invited individually. Guardian links require staff review before a child is connected.</p>
        </div>
        {teams.length > 1 && <div className="w-full sm:w-56"><Label className="sr-only" htmlFor="join-access-team">Team for join settings</Label><Select value={String(teamId ?? "")} onValueChange={(v) => { setSelectedTeamId(Number(v)); setMessage(""); setCopied(false); }}><SelectTrigger id="join-access-team"><SelectValue placeholder="Choose a team" /></SelectTrigger><SelectContent>{teams.map((team) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}</SelectContent></Select></div>}
      </div>
      {!teamId ? <div className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Choose an eligible team to manage its joining code and guardian requests.</div> : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0 rounded-2xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><p className="font-semibold">{teams.find((team) => team.id === teamId)?.name || "Selected team"}</p><span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Staff only</span></div>
              {codeQuery.isLoading ? <div className="h-10 animate-pulse rounded-lg bg-muted" /> : codeQuery.isError ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Could not load this team&apos;s code.</p><Button variant="outline" size="sm" onClick={() => void codeQuery.refetch()}>Retry</Button></div> : code?.code ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row"><div className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg border bg-background px-3 font-mono text-lg font-bold tracking-[0.18em]">{code.code}</div><Button variant="outline" onClick={() => void copyText(code.code!, "Team code copied.")}><Copy className="mr-2 h-4 w-4" />Copy code</Button></div>
                  <div className="flex flex-col gap-2 sm:flex-row"><div className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2.5 text-xs text-muted-foreground">{link}</div><Button variant="outline" onClick={() => void copyText(link, "Join link copied.")}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}Copy link</Button></div>
                </div>
              ) : <p className="text-sm text-muted-foreground">No active code. Create one to let players join using this team&apos;s code.</p>}
              {message && <p role="status" className={`mt-3 text-sm ${message.includes("failed") || message.startsWith("Could") ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>}
            </div>
            <div className="flex flex-row gap-2 lg:flex-col">
              <Button onClick={refreshCode} disabled={rotate.isPending} className="flex-1 rounded-xl lg:flex-none">{code?.code ? <RefreshCw className="mr-2 h-4 w-4" /> : <Link2 className="mr-2 h-4 w-4" />}{rotate.isPending ? "Creating…" : code?.code ? "Replace code" : "Create code"}</Button>
              {code?.code && <Button variant="outline" onClick={disableCode} disabled={disable.isPending} className="flex-1 rounded-xl text-destructive hover:text-destructive lg:flex-none">{disable.isPending ? "Disabling…" : "Disable code"}</Button>}
            </div>
          </div>
          <div className="mt-7 border-t pt-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-display text-lg font-bold">Guardian requests</h3><p className="text-sm text-muted-foreground">Match each child to a player already on this team.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{requestsQuery.data?.length ?? 0} waiting</span></div>
            {requestsQuery.isLoading ? <div className="space-y-2"><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /></div> : requestsQuery.isError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-sm"><span className="text-muted-foreground">Could not load guardian requests.</span><Button variant="outline" size="sm" onClick={() => void requestsQuery.refetch()}>Retry</Button></div> : !requestsQuery.data?.length ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No guardian requests need review.</div> : (
              <div className="space-y-3">
                {requestsQuery.data.map((request) => (
                  <article key={request.id} className="rounded-2xl border p-4" data-testid={`guardian-request-${request.id}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0"><p className="font-semibold">{request.name}</p><p className="mt-0.5 text-sm text-muted-foreground">Guardian request for <strong className="font-semibold text-foreground">{request.childName}</strong></p><p className="mt-1 text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p></div>
                      <div className="flex min-w-0 flex-col gap-2 sm:w-72">
                        <Select value={selectedPlayers[request.id] ?? ""} onValueChange={(value) => setSelectedPlayers((current) => ({ ...current, [request.id]: value }))}><SelectTrigger aria-label={`Select existing player for ${request.name}`}><SelectValue placeholder="Select existing player" /></SelectTrigger><SelectContent>{(playersQuery.data ?? []).map((player) => <SelectItem key={player.id} value={String(player.id)}>{player.fullName}</SelectItem>)}</SelectContent></Select>
                        <div className="flex gap-2"><Button className="flex-1" size="sm" disabled={!selectedPlayers[request.id] || review.isPending || !playersQuery.data?.length} onClick={() => decide(request.id, "approve")}><UserRoundCheck className="mr-1.5 h-4 w-4" />Approve</Button><Button variant="outline" size="sm" disabled={review.isPending} onClick={() => decide(request.id, "reject")}><X className="mr-1.5 h-4 w-4" />Reject</Button></div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Approval connects the guardian to a selected existing player. It does not add a child or grant staff permissions.</p></div>
        </>
      )}
    </section>
  );
}
