import { useState } from "react";
import { Trash2, Link2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPeople,
  useCreateGuardianship,
  useRemoveGuardianship,
  getGetPersonQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
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

type Direction = "addGuardian" | "addPlayer";

export function LinkGuardianDialog({
  personId,
  direction,
  excludeIds,
}: {
  personId: number;
  direction: Direction;
  excludeIds: number[];
}) {
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState("");
  const [relationship, setRelationship] = useState<string>("parent");

  const { data: people } = useListPeople();
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateGuardianship();

  const available = (people ?? []).filter(
    (p) => p.id !== personId && !excludeIds.includes(p.id),
  );

  const isAddGuardian = direction === "addGuardian";

  function submit() {
    if (!otherId) {
      toast({ title: "Pick a person first", variant: "destructive" });
      return;
    }
    const other = Number(otherId);
    create.mutate(
      {
        data: {
          guardianId: isAddGuardian ? other : personId,
          playerId: isAddGuardian ? personId : other,
          relationship: relationship as "parent" | "guardian" | "other",
          canManage: true,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetPersonQueryKey(personId) });
          qc.invalidateQueries({ queryKey: getGetPersonQueryKey(other) });
          toast({ title: "Family link added" });
          setOtherId("");
          setRelationship("parent");
          setOpen(false);
        },
        onError: () =>
          toast({
            title: "Could not link",
            description: "You may not have permission for this action.",
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="rounded-lg h-8 text-xs">
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          {isAddGuardian ? "Link guardian" : "Link player"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isAddGuardian ? "Link a guardian" : "Link a player"}
          </DialogTitle>
          <DialogDescription>
            {isAddGuardian
              ? "Choose the parent or guardian responsible for this player."
              : "Choose the player this person is a guardian for."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{isAddGuardian ? "Guardian" : "Player"}</Label>
            <Select value={otherId} onValueChange={setOtherId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No eligible people found.
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
          </div>

          <div className="space-y-2">
            <Label>Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">Parent</SelectItem>
                <SelectItem value="guardian">Guardian</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={create.isPending}
            className="rounded-xl"
          >
            {create.isPending ? "Linking..." : "Add link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveGuardianButton({
  guardianshipId,
  personId,
  otherId,
}: {
  guardianshipId: number;
  personId: number;
  otherId: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const remove = useRemoveGuardianship();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          aria-label="Remove family link"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove family link?</AlertDialogTitle>
          <AlertDialogDescription>
            This unlinks the guardian and player. Both accounts stay intact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              remove.mutate(
                { guardianshipId },
                {
                  onSuccess: () => {
                    qc.invalidateQueries({
                      queryKey: getGetPersonQueryKey(personId),
                    });
                    qc.invalidateQueries({
                      queryKey: getGetPersonQueryKey(otherId),
                    });
                    toast({ title: "Link removed" });
                  },
                  onError: () =>
                    toast({
                      title: "Could not remove link",
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
