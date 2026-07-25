import { useMemo, useState } from "react";
import { Plus, MapPin, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  getGetMeQueryKey,
  useListTeams,
  getListTeamsQueryKey,
  useCreateEvent,
  getListUpcomingEventsQueryKey,
  useListMyEventLocations,
  getListMyEventLocationsQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const EVENT_TYPES = [
  { value: "training", label: "Training" },
  { value: "game", label: "Game" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
] as const;

const DEFAULT_TITLES: Record<string, string> = {
  training: "Team training",
  game: "Game",
  social: "Social event",
  other: "",
};

/** "New +" button (staff only) that opens the create-event form. */
export function NewEventDialog() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isClubAdmin = !!me?.isClubAdmin;
  const { data: allTeams } = useListTeams({
    query: { queryKey: getListTeamsQueryKey(), enabled: isClubAdmin },
  });
  const [open, setOpen] = useState(false);

  const staffTeams = useMemo(() => {
    return isClubAdmin
      ? (allTeams ?? []).map((t) => ({ id: t.id, name: t.name }))
      : (me?.memberships ?? [])
          .filter((m) => m.role === "coach" || m.role === "manager")
          .map((m) => ({ id: m.teamId, name: m.teamName }));
  }, [isClubAdmin, allTeams, me]);

  if (!me || staffTeams.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full font-bold px-4">
          New <Plus className="h-4 w-4 ml-1" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <EventForm teams={staffTeams} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  teams,
  onDone,
}: {
  teams: { id: number; name: string }[];
  onDone: () => void;
}) {
  const [teamId, setTeamId] = useState<string>(
    teams.length === 1 ? String(teams[0].id) : "",
  );
  const [type, setType] = useState<string>("training");
  const [title, setTitle] = useState(DEFAULT_TITLES.training);
  const [titleTouched, setTitleTouched] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [opponent, setOpponent] = useState("");
  const [location, setLocation] = useState("");
  const [locationFocused, setLocationFocused] = useState(false);
  const [notes, setNotes] = useState("");
  const [invited, setInvited] = useState<Record<string, boolean>>({
    coaches: true,
    players: true,
    parents: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: recentLocations } = useListMyEventLocations({
    query: { queryKey: getListMyEventLocationsQueryKey() },
  });

  const createEvent = useCreateEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
        toast({ title: "Event created" });
        onDone();
      },
      onError: () =>
        toast({ title: "Couldn't create the event", variant: "destructive" }),
    },
  });

  const pickType = (t: string) => {
    setType(t);
    if (!titleTouched) setTitle(DEFAULT_TITLES[t] ?? "");
  };

  const q = location.trim().toLowerCase();
  const suggestions = (recentLocations ?? []).filter(
    (l) => !q || l.toLowerCase().includes(q),
  );
  const exactMatch = (recentLocations ?? []).some(
    (l) => l.toLowerCase() === q,
  );

  const invitedRoles = (["coaches", "players", "parents"] as const).filter(
    (r) => invited[r],
  );
  const canSubmit =
    teamId !== "" && title.trim() !== "" && date !== "" && startTime !== "" &&
    invitedRoles.length > 0 && !createEvent.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const startsAt = new Date(`${date}T${startTime}`);
    const endsAt = endTime ? new Date(`${date}T${endTime}`) : null;
    createEvent.mutate({
      teamId: Number(teamId),
      data: {
        type: type as "training" | "game" | "social" | "other",
        title: title.trim(),
        startsAt: startsAt.toISOString(),
        ...(endsAt && endsAt > startsAt ? { endsAt: endsAt.toISOString() } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(type === "game" && opponent.trim() ? { opponent: opponent.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        invitedRoles,
      },
    });
  };

  return (
    <div className="space-y-4">
      {teams.length > 1 && (
        <div className="space-y-1.5">
          <Label>Team</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger><SelectValue placeholder="Choose a team" /></SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Type</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => pickType(t.value)}
              className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${
                type === t.value
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-title">Title</Label>
        <Input
          id="ev-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
          placeholder="e.g. Team training"
        />
      </div>

      {type === "game" && (
        <div className="space-y-1.5">
          <Label htmlFor="ev-opponent">Opponent</Label>
          <Input
            id="ev-opponent"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g. Westside Wolves"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5 col-span-1">
          <Label htmlFor="ev-date">Date</Label>
          <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-start">Start</Label>
          <Input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-end">End</Label>
          <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-location">Location</Label>
        <Input
          id="ev-location"
          value={location}
          autoComplete="off"
          onChange={(e) => setLocation(e.target.value)}
          onFocus={() => setLocationFocused(true)}
          onBlur={() => setTimeout(() => setLocationFocused(false), 150)}
          placeholder="Search or type a location…"
        />
        {locationFocused && (suggestions.length > 0 || (q && !exactMatch)) && (
          <div className="rounded-xl border bg-card shadow-sm divide-y overflow-hidden">
            {suggestions.slice(0, 5).map((l) => (
              <button
                key={l}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted"
                onMouseDown={() => setLocation(l)}
              >
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{l}</span>
              </button>
            ))}
            {q && !exactMatch && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted text-muted-foreground"
                onMouseDown={() => setLocationFocused(false)}
              >
                <Check className="h-4 w-4 shrink-0" />
                <span>Use “{location.trim()}” as typed</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Invitations</Label>
        <div className="rounded-xl border divide-y">
          {(
            [
              { key: "coaches", label: "Coaches", hint: null },
              { key: "players", label: "Players", hint: "Parents automatically get RSVP reminders for their child." },
              { key: "parents", label: "Parents", hint: null },
            ] as const
          ).map((r) => (
            <div key={r.key} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold">{r.label}</div>
                {r.hint && invited[r.key] && (
                  <div className="text-xs text-muted-foreground">{r.hint}</div>
                )}
              </div>
              <Switch
                checked={invited[r.key]}
                onCheckedChange={(v) => setInvited((s) => ({ ...s, [r.key]: v }))}
              />
            </div>
          ))}
        </div>
        {invitedRoles.length === 0 && (
          <p className="text-xs text-destructive">Invite at least one group.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-notes">Notes</Label>
        <Textarea
          id="ev-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the team should know…"
          rows={2}
        />
      </div>

      <Button className="w-full rounded-xl h-11 font-bold" disabled={!canSubmit} onClick={submit}>
        {createEvent.isPending ? "Creating…" : "Create event"}
      </Button>
    </div>
  );
}
