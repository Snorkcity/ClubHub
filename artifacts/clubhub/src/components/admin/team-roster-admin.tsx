import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPeople,
  useGetMe,
  useCreatePerson,
  getListPeopleQueryKey,
  useAddTeamMember,
  useRemoveTeamMember,
  getListTeamMembersQueryKey,
  getGetTeamSummaryQueryKey,
  getGetTeamQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Mode = "player" | "staff";

function invalidateTeam(qc: ReturnType<typeof useQueryClient>, teamId: number) {
  qc.invalidateQueries({ queryKey: getListTeamMembersQueryKey(teamId) });
  qc.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(teamId) });
  qc.invalidateQueries({ queryKey: getGetTeamQueryKey(teamId) });
}

export function AddMemberDialog({
  teamId,
  existingUserIds,
  mode,
}: {
  teamId: number;
  existingUserIds: number[];
  mode: Mode;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<string>(mode === "player" ? "player" : "coach");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const [createNew, setCreateNew] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { data: me } = useGetMe();
  const createPerson = useCreatePerson();

  const { data: people } = useListPeople();
  const qc = useQueryClient();
  const { toast } = useToast();
  const add = useAddTeamMember();

  const available = (people ?? []).filter(
    (p) => !existingUserIds.includes(p.id),
  );

  function reset() {
    setPersonId("");
    setRole(mode === "player" ? "player" : "coach");
    setJersey("");
    setPosition("");
    setCreateNew(false);
    setFirstName("");
    setLastName("");
  }

  function submit() {
    if (createNew) {
      if (!firstName.trim() || !lastName.trim()) return;
      createPerson.mutate({ data: { firstName: firstName.trim(), lastName: lastName.trim(), teamId } }, {
        onSuccess: () => {
          invalidateTeam(qc, teamId);
          void qc.invalidateQueries({ queryKey: getListPeopleQueryKey() });
          toast({ title: "Player created and added to the team" });
          reset();
          setOpen(false);
        },
        onError: (error: any) => toast({
          title: "Could not add player",
          description: error?.data?.error ?? "Check the details and try again.",
          variant: "destructive",
        }),
      });
      return;
    }
    if (!personId) {
      toast({ title: "Pick a person first", variant: "destructive" });
      return;
    }
    add.mutate(
      {
        teamId,
        data: {
          personId: Number(personId),
          role: role as "manager" | "coach" | "player",
          jerseyNumber:
            mode === "player" && jersey ? Number(jersey) : undefined,
          position: mode === "player" && position ? position : undefined,
        },
      },
      {
        onSuccess: () => {
          invalidateTeam(qc, teamId);
          toast({ title: "Added to the team" });
          reset();
          setOpen(false);
        },
        onError: () =>
          toast({
            title: "Could not add member",
            description: "You may not have permission, or they're already on the team.",
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-xl">
          <UserPlus className="h-4 w-4 mr-2" />
          {mode === "player" ? "Add Player" : "Add Staff"}
        </Button>
      </DialogTrigger>
      <DialogContent className="min-w-0 max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {mode === "player" ? "Add Player" : "Add Staff"}
          </DialogTitle>
          <DialogDescription>
            {mode === "player"
              ? "Choose an existing person to keep their history, or create a new player without an email."
              : "Assign a coach or manager to this team."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "player" && me?.isClubAdmin && (
            <Button variant="outline" onClick={() => setCreateNew(!createNew)}>
              {createNew ? "Choose existing person instead" : "New player without email"}
            </Button>
          )}
          {createNew ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Check the club directory first to avoid a duplicate. The player gets their own permanent record; invite their parent separately.</p>
              <div className="space-y-2"><Label htmlFor="new-player-first">Player first name</Label>
                <Input id="new-player-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="new-player-last">Player last name</Label>
                <Input id="new-player-last" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
          ) : <div className="space-y-2">
            <Label>Person</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Everyone is already on this team.
                  </div>
                ) : (
                  available.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.fullName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>}

          {mode === "staff" && (
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "player" && !createNew && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Jersey #</Label>
                <Input
                  type="number"
                  value={jersey}
                  onChange={(e) => setJersey(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Midfielder"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={add.isPending || createPerson.isPending || (createNew && (!firstName.trim() || !lastName.trim()))} className="rounded-xl">
            {add.isPending || createPerson.isPending ? "Adding..." : "Add to team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMemberButton({
  memberId,
  teamId,
  name,
  className,
}: {
  memberId: number;
  teamId: number;
  name?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const remove = useRemoveTeamMember();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={
            "h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 " +
            (className ?? "")
          }
          aria-label="Remove from team"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from team?</AlertDialogTitle>
          <AlertDialogDescription>
            {name ? `${name} will be removed from this team's roster.` : "This person will be removed from this team's roster."}{" "}
            Their account and history stay intact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              remove.mutate(
                { memberId },
                {
                  onSuccess: () => {
                    invalidateTeam(qc, teamId);
                    toast({ title: "Removed from team" });
                  },
                  onError: () =>
                    toast({
                      title: "Could not remove member",
                      variant: "destructive",
                    }),
                },
              )
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
