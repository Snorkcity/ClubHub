import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, Crown, Loader2, Megaphone, Shield, UserRoundMinus, UserRoundPlus } from "lucide-react";
import {
  getGetClubAccessQueryKey,
  getGetMeQueryKey,
  useGetClubAccess,
  useTransferClubAdmin,
  useUpdateClubAnnouncer,
  type ClubAccessMember,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Props = {
  currentPersonId: number;
  isClubAdmin: boolean;
};

function Initials({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials || "?"}</span>;
}

function MemberRow({ member, children }: { member: ClubAccessMember; children?: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-2.5 rounded-2xl border border-border/70 bg-background/50 px-3 py-2.5 sm:gap-3 sm:px-4">
      <Initials name={member.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{member.name}</p>
        <p className="text-xs text-muted-foreground">{member.role === "admin" ? "Club administrator" : member.role === "announcer" ? "Club announcer" : "Club member"}</p>
      </div>
      {children}
    </div>
  );
}

export function ClubRoleSettings({ currentPersonId, isClubAdmin }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedAnnouncer, setSelectedAnnouncer] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState("");
  const [removeCandidate, setRemoveCandidate] = useState<ClubAccessMember | null>(null);
  const [transferCandidate, setTransferCandidate] = useState<ClubAccessMember | null>(null);
  const [transferPhrase, setTransferPhrase] = useState("");
  const [accessEnabled, setAccessEnabled] = useState(true);
  const accessQueryKey = getGetClubAccessQueryKey();
  const accessQuery = useGetClubAccess({
    query: { enabled: isClubAdmin && accessEnabled, queryKey: accessQueryKey, refetchInterval: 30000 },
  });
  const updateAnnouncer = useUpdateClubAnnouncer();
  const transferAdmin = useTransferClubAdmin();
  const access = accessQuery.data;
  const members = useMemo(() => access?.members ?? [], [access?.members]);
  const admins = members.filter((member) => member.role === "admin");
  const currentAdmin = admins.find((member) => member.personId === currentPersonId);
  const announcers = members.filter((member) => member.role === "announcer");
  const availableMembers = members.filter((member) => member.role === "member");
  const transferOptions = members.filter((member) => member.personId !== currentPersonId);

  const refreshAccess = async () => {
    await queryClient.invalidateQueries({ queryKey: accessQueryKey });
  };

  const addAnnouncer = async () => {
    if (!selectedAnnouncer) return;
    try {
      await updateAnnouncer.mutateAsync({ personId: Number(selectedAnnouncer), data: { role: "announcer" } });
      setSelectedAnnouncer("");
      await refreshAccess();
      toast({ title: "Club announcer added" });
    } catch (error) {
      toast({ title: "Could not add club announcer", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const removeAnnouncer = async () => {
    if (!removeCandidate) return;
    try {
      await updateAnnouncer.mutateAsync({ personId: removeCandidate.personId, data: { role: "member" } });
      setRemoveCandidate(null);
      await refreshAccess();
      toast({ title: `${removeCandidate.name} is no longer a club announcer` });
    } catch (error) {
      toast({ title: "Could not remove announcer", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handOverAdmin = async () => {
    if (!transferCandidate || transferPhrase !== "TRANSFER") return;
    const isKeepingSelf = transferCandidate.personId === currentPersonId;
    try {
      await transferAdmin.mutateAsync({ data: { personId: transferCandidate.personId, confirmation: "TRANSFER" } });
    } catch (error) {
      toast({ title: isKeepingSelf ? "Could not consolidate club administration" : "Could not transfer club administration", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      return;
    }

    if (isKeepingSelf) {
      const adminName = transferCandidate.name;
      setTransferCandidate(null);
      setTransferPhrase("");
      setSelectedTransfer("");
      try {
        await queryClient.refetchQueries({ queryKey: accessQueryKey, type: "active" }, { throwOnError: true });
        toast({ title: `${adminName} is now the sole club administrator` });
      } catch {
        toast({
          title: "Consolidation completed; roles could not refresh",
          description: "The administrator change was saved. Refresh to see the latest club roles.",
          variant: "destructive",
        });
      }
      return;
    }

    const recipientName = transferCandidate.name;
    setAccessEnabled(false);
    await queryClient.cancelQueries();
    // Do not retain directories/reports fetched using the previous admin role.
    queryClient.removeQueries({
      predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(getGetMeQueryKey()),
    });
    queryClient.setQueryData(getGetMeQueryKey(), (old: any) =>
      old ? { ...old, isClubAdmin: false, clubRole: "member" } : old
    );
    setTransferCandidate(null);
    setTransferPhrase("");
    setSelectedTransfer("");

    try {
      await queryClient.refetchQueries({ queryKey: getGetMeQueryKey(), type: "active" }, { throwOnError: true });
      toast({ title: `Club administration handed to ${recipientName}` });
    } catch {
      toast({
        title: "Handover completed; profile refresh needed",
        description: "Your previous administrator access has been removed here. Refresh to load the latest profile.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="overflow-hidden rounded-3xl border border-border/80 shadow-sm" data-testid="club-role-settings">
      <div className="border-b border-border/70 bg-primary/[0.045] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Shield className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-display font-bold">Club roles</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">Choose who manages the club and shares announcements. Announcer access does not grant access to private player records.</p>
          </div>
          <span className="hidden rounded-full border border-primary/15 bg-background/70 px-3 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">ADMIN ONLY</span>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:space-y-6 sm:p-5">
        {accessQuery.isLoading ? (
          <div className="space-y-3" aria-label="Loading club roles">
            <div className="h-[60px] animate-pulse rounded-2xl bg-muted/70" />
            <div className="h-[60px] animate-pulse rounded-2xl bg-muted/70" />
          </div>
        ) : accessQuery.isError ? (
          <div role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
            <p className="font-semibold">Club roles couldn’t be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">Your settings haven’t been changed.</p>
            <Button type="button" variant="outline" className="mt-3 min-h-11 rounded-xl" onClick={() => void accessQuery.refetch()}>Try again</Button>
          </div>
        ) : (
          <>
            <section aria-labelledby="club-admin-heading">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <h3 id="club-admin-heading" className="font-bold">Club administrators</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Club-wide admin access includes private club records.</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{String(admins.length).padStart(2, "0")} / 01</span>
              </div>
              {admins.length > 0 ? (
                <div className="space-y-2">
                  {admins.map((member) => (
                    <MemberRow key={member.personId} member={member}>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <Crown className="h-3.5 w-3.5" />{member.personId === currentPersonId ? "You · Admin" : "Admin"}
                      </span>
                    </MemberRow>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No administrator is listed. Refresh to check current club access.</div>
              )}
              {admins.length > 1 && (
                <div className="mt-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5">
                  <p className="text-sm font-semibold">Legacy access: {admins.length} administrators currently have club-wide powers.</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">No one has been changed. These administrators retain their access until a current admin confirms a handover or chooses to keep themselves as the sole admin.</p>
                  {currentAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 min-h-11 rounded-xl border-amber-500/30"
                      disabled={transferAdmin.isPending}
                      onClick={() => setTransferCandidate(currentAdmin)}
                    >
                      <Shield className="mr-2 h-4 w-4" />Keep me as sole admin
                    </Button>
                  )}
                </div>
              )}
            </section>

            <section aria-labelledby="announcer-heading">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <h3 id="announcer-heading" className="font-bold">Club announcers</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Can share club-wide updates. No junior records.</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{String(announcers.length).padStart(2, "0")} / 03</span>
              </div>
              {announcers.length > 0 ? (
                <div className="space-y-2">
                  {announcers.map((member) => (
                    <MemberRow key={member.personId} member={member}>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${member.name} as club announcer`} className="min-h-11 shrink-0 rounded-xl px-3 text-muted-foreground hover:text-destructive" disabled={updateAnnouncer.isPending || transferAdmin.isPending} onClick={() => setRemoveCandidate(member)}>
                        <UserRoundMinus className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Remove</span>
                      </Button>
                    </MemberRow>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Megaphone className="h-4 w-4" /></span>
                  <p className="text-sm text-muted-foreground">No announcers yet. Add a trusted club member below.</p>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Choose an existing member to add as announcer</span>
                  <select
                    aria-label="Choose an existing member to add as announcer"
                    value={selectedAnnouncer}
                    onChange={(event) => setSelectedAnnouncer(event.target.value)}
                    disabled={availableMembers.length === 0 || announcers.length >= 3 || updateAnnouncer.isPending}
                    className="h-12 w-full appearance-none rounded-xl border border-border bg-background px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                  >
                    <option value="">{availableMembers.length ? "Select an existing club member" : "No eligible members available"}</option>
                    {availableMembers.map((member) => <option key={member.personId} value={member.personId}>{member.name}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </label>
                <Button type="button" className="min-h-12 rounded-xl sm:min-w-36" disabled={!selectedAnnouncer || announcers.length >= 3 || updateAnnouncer.isPending} onClick={() => void addAnnouncer()}>
                  {updateAnnouncer.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundPlus className="mr-2 h-4 w-4" />}
                  Add announcer
                </Button>
              </div>
              {announcers.length >= 3 && <p className="mt-2 text-xs text-muted-foreground">The three announcer places are full. Remove an announcer before adding someone else.</p>}
              <p className="mt-2 text-xs text-muted-foreground">Only current registered members of this club are listed. This panel does not send invitations.</p>
            </section>

            <section className="border-t border-border/70 pt-5" aria-labelledby="handover-heading">
              <div className="mb-3 flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><ArrowRightLeft className="h-4 w-4" /></span>
                <div>
                  <h3 id="handover-heading" className="font-bold">Transfer club administration</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Hand club-wide admin powers to another current club member. This cannot be undone here.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Choose an existing member to receive club administration</span>
                  <select
                    aria-label="Choose an existing member to receive club administration"
                    value={selectedTransfer}
                    onChange={(event) => setSelectedTransfer(event.target.value)}
                    disabled={transferOptions.length === 0 || transferAdmin.isPending}
                    className="h-12 w-full appearance-none rounded-xl border border-border bg-background px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                  >
                    <option value="">Select a current club member</option>
                    {transferOptions.map((member) => <option key={member.personId} value={member.personId}>{member.name}{member.role === "admin" ? " · current admin" : member.role === "announcer" ? " · announcer" : ""}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </label>
                <Button type="button" variant="outline" className="min-h-12 rounded-xl sm:min-w-44" disabled={!selectedTransfer || transferAdmin.isPending} onClick={() => setTransferCandidate(transferOptions.find((member) => member.personId === Number(selectedTransfer)) ?? null)}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />Review handover
                </Button>
              </div>
              {admins.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Confirming a handover makes the selected person the sole administrator and removes club-wide admin authority from every other admin.</p>}
              {transferOptions.length === 0 && <p className="mt-2 text-xs text-muted-foreground">There are no other current club members to receive administration.</p>}
            </section>
          </>
        )}
      </div>

      {removeCandidate && (
        <Dialog open onOpenChange={(open) => { if (!open && !updateAnnouncer.isPending) setRemoveCandidate(null); }}>
          <DialogContent aria-describedby={undefined} className="max-w-md rounded-3xl border bg-card p-5 shadow-xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><UserRoundMinus className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="font-display text-lg font-bold">Remove announcer access?</DialogTitle>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground"><strong className="text-foreground">{removeCandidate.name}</strong> will return to member access and won’t be able to publish club-wide announcements.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={updateAnnouncer.isPending} onClick={() => setRemoveCandidate(null)}>Keep announcer</Button>
              <Button type="button" variant="destructive" className="min-h-11 rounded-xl" disabled={updateAnnouncer.isPending} onClick={() => void removeAnnouncer()}>
                {updateAnnouncer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove access
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {transferCandidate && (
        <Dialog open onOpenChange={(open) => { if (!open && !transferAdmin.isPending) { setTransferCandidate(null); setTransferPhrase(""); } }}>
          <DialogContent aria-describedby={undefined} className="max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border bg-card p-5 shadow-xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="font-display text-lg font-bold">{transferCandidate.personId === currentPersonId ? "Keep me as sole admin?" : "Confirm admin handover"}</DialogTitle>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {transferCandidate.personId === currentPersonId
                    ? <>You’re confirming <strong className="text-foreground">{transferCandidate.name}</strong> as the sole club administrator.</>
                    : <>You’re about to make <strong className="text-foreground">{transferCandidate.name}</strong> the sole club administrator.</>}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <p className="text-sm font-semibold">
                {transferCandidate.personId === currentPersonId
                  ? "Every other current admin will lose club-wide admin authority."
                  : admins.length > 1
                    ? "Every other current admin will lose club-wide admin authority, including you."
                    : "Your club-wide admin powers will end."}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                {transferCandidate.personId !== currentPersonId && (
                  <>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />You keep your club membership and any team roles.</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />You will not automatically become a club announcer.</li>
                  </>
                )}
                {transferCandidate.role === "announcer" && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />Their announcer place is freed when they become admin.</li>}
                {transferCandidate.personId === currentPersonId && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />Other administrators retain their club membership and team roles; you remain administrator.</li>}
              </ul>
            </div>
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-semibold">Type TRANSFER to confirm</span>
              <input autoComplete="off" value={transferPhrase} onChange={(event) => setTransferPhrase(event.target.value)} aria-label="Type TRANSFER to confirm administrator handover" className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={transferAdmin.isPending} onClick={() => { setTransferCandidate(null); setTransferPhrase(""); }}>Cancel</Button>
              <Button type="button" variant="destructive" className="min-h-11 rounded-xl" disabled={transferPhrase !== "TRANSFER" || transferAdmin.isPending} onClick={() => void handOverAdmin()}>
                {transferAdmin.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
                {transferCandidate.personId === currentPersonId ? "Keep me as sole admin" : "Transfer administration"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
