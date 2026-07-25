import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, MapPin, Check, Search, Repeat } from "lucide-react";
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
  useCreatePost,
  getListTeamPostsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";

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
  { value: "other", label: "Other" },
] as const;

const DEFAULT_TITLES: Record<string, string> = {
  training: "Team training",
  game: "Game",
  other: "",
};

const DURATIONS = [
  { value: "60", label: "1 hour" },
  { value: "90", label: "90 mins" },
  { value: "120", label: "2 hours" },
  { value: "custom", label: "Custom…" },
] as const;

const DEFAULT_NOTES = "Players to arrive by ";

/** Free OpenStreetMap address search (Nominatim), debounced. */
function useAddressSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!enabled || query.trim().length < 3) {
      setResults([]);
      return;
    }
    clearTimeout(timer.current);
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=au&q=${encodeURIComponent(query.trim())}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("search failed");
        const data: { display_name: string }[] = await res.json();
        setResults(
          data.map((d) =>
            d.display_name.split(", ").slice(0, 4).join(", "),
          ),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [query, enabled]);

  return { results, searching };
}

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

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
  const [duration, setDuration] = useState<string>("60");
  const [endTime, setEndTime] = useState("");
  const [opponent, setOpponent] = useState("");
  const [location, setLocation] = useState("");
  const [locationFocused, setLocationFocused] = useState(false);
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [invited, setInvited] = useState<Record<string, boolean>>({
    coaches: true,
    players: true,
    parents: false,
  });
  const [confirmingNotify, setConfirmingNotify] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: recentLocations } = useListMyEventLocations({
    query: { queryKey: getListMyEventLocationsQueryKey() },
  });
  const { results: addressResults, searching } = useAddressSearch(
    location,
    locationFocused,
  );

  const createEvent = useCreateEvent();
  const createPost = useCreatePost();

  const pickType = (t: string) => {
    setType(t);
    if (!titleTouched) setTitle(DEFAULT_TITLES[t] ?? "");
  };

  const effectiveEndTime =
    duration === "custom" ? endTime : startTime ? addMinutes(startTime, Number(duration)) : "";

  const q = location.trim().toLowerCase();
  const recentMatches = (recentLocations ?? []).filter(
    (l) => !q || l.toLowerCase().includes(q),
  );
  const exactMatch = (recentLocations ?? []).some((l) => l.toLowerCase() === q);

  const invitedRoles = (["coaches", "players", "parents"] as const).filter(
    (r) => invited[r],
  );

  // Dates this event will be created for (weekly repeats included).
  const eventDates = useMemo(() => {
    if (!date) return [];
    if (!repeatWeekly || !repeatUntil) return [date];
    const dates: string[] = [];
    const end = new Date(`${repeatUntil}T23:59:59`);
    let d = new Date(`${date}T12:00:00`);
    while (d <= end && dates.length < 26) {
      dates.push(format(d, "yyyy-MM-dd"));
      d = new Date(d.getTime() + 7 * 24 * 3600 * 1000);
    }
    return dates;
  }, [date, repeatWeekly, repeatUntil]);

  const canSubmit =
    teamId !== "" && title.trim() !== "" && eventDates.length > 0 &&
    startTime !== "" && invitedRoles.length > 0 && !submitting &&
    (duration !== "custom" || endTime !== "");

  const notesTrimmed =
    notes.trim() === DEFAULT_NOTES.trim() ? "" : notes.trim();

  const doCreate = async (notify: boolean) => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const tid = Number(teamId);
      for (const d of eventDates) {
        const startsAt = new Date(`${d}T${startTime}`);
        const endsAt = effectiveEndTime ? new Date(`${d}T${effectiveEndTime}`) : null;
        await createEvent.mutateAsync({
          teamId: tid,
          data: {
            type: type as "training" | "game" | "other",
            title: title.trim(),
            startsAt: startsAt.toISOString(),
            ...(endsAt && endsAt > startsAt ? { endsAt: endsAt.toISOString() } : {}),
            ...(location.trim() ? { location: location.trim() } : {}),
            ...(type === "game" && opponent.trim() ? { opponent: opponent.trim() } : {}),
            ...(notesTrimmed ? { notes: notesTrimmed } : {}),
            invitedRoles,
          },
        });
      }
      if (notify) {
        const first = new Date(`${eventDates[0]}T${startTime}`);
        const when = format(first, "EEEE d MMMM, h:mmaaa");
        const repeatLine =
          eventDates.length > 1
            ? ` Repeats weekly (${eventDates.length} sessions) until ${format(new Date(`${eventDates[eventDates.length - 1]}T12:00:00`), "d MMMM")}.`
            : "";
        await createPost.mutateAsync({
          teamId: tid,
          data: {
            title: `New event: ${title.trim()}`,
            body: `${title.trim()} — ${when}${location.trim() ? ` at ${location.trim()}` : ""}.${repeatLine}${notesTrimmed ? ` ${notesTrimmed}` : ""} Please RSVP on the Schedule page.`,
          },
        });
        queryClient.invalidateQueries({ queryKey: getListTeamPostsQueryKey(tid) });
      }
      queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
      toast({
        title:
          eventDates.length > 1
            ? `${eventDates.length} events created`
            : "Event created",
        ...(notify ? { description: "The team has been notified in the feed." } : {}),
      });
      onDone();
    } catch {
      toast({ title: "Couldn't create the event", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
    } finally {
      setSubmitting(false);
      setConfirmingNotify(false);
    }
  };

  if (confirmingNotify) {
    return (
      <div className="space-y-4 text-center py-2">
        <p className="font-semibold">
          {eventDates.length > 1
            ? `Create ${eventDates.length} events and notify the team?`
            : "Notify everyone invited?"}
        </p>
        <p className="text-sm text-muted-foreground">
          Notifying posts an announcement to the team feed with the event details.
        </p>
        <div className="space-y-2">
          <Button className="w-full rounded-xl h-11 font-bold" disabled={submitting} onClick={() => doCreate(true)}>
            {submitting ? "Creating…" : "Create & notify team"}
          </Button>
          <Button variant="outline" className="w-full rounded-xl h-11 font-bold" disabled={submitting} onClick={() => doCreate(false)}>
            Create without notifying
          </Button>
          <Button variant="ghost" className="w-full" disabled={submitting} onClick={() => setConfirmingNotify(false)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

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
        <div className="grid grid-cols-3 gap-1.5">
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

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev-date">Date</Label>
          <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-start">Start time</Label>
          <Input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
      </div>

      <div className={`grid gap-2 ${duration === "custom" ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="space-y-1.5">
          <Label>Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {duration === "custom" ? (
          <div className="space-y-1.5">
            <Label htmlFor="ev-end">End time</Label>
            <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        ) : (
          startTime && (
            <p className="text-xs text-muted-foreground -mt-2">
              Ends at {format(new Date(`2000-01-01T${effectiveEndTime}`), "h:mm a")}
            </p>
          )
        )}
      </div>

      <div className="rounded-xl border px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Repeat className="h-4 w-4 text-muted-foreground" /> Repeats weekly
          </div>
          <Switch checked={repeatWeekly} onCheckedChange={setRepeatWeekly} />
        </div>
        {repeatWeekly && (
          <div className="space-y-1.5">
            <Label htmlFor="ev-until">Until</Label>
            <Input id="ev-until" type="date" value={repeatUntil} min={date} onChange={(e) => setRepeatUntil(e.target.value)} />
            {eventDates.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {eventDates.length} sessions, same time each week.
              </p>
            )}
          </div>
        )}
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
          placeholder="Search an address or type a place…"
        />
        {locationFocused && (recentMatches.length > 0 || addressResults.length > 0 || searching || (q && !exactMatch)) && (
          <div className="rounded-xl border bg-card shadow-sm divide-y overflow-hidden">
            {recentMatches.slice(0, 4).map((l) => (
              <button
                key={`r-${l}`}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted"
                onMouseDown={() => setLocation(l)}
              >
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{l}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">recent</span>
              </button>
            ))}
            {addressResults
              .filter((a) => !recentMatches.some((r) => r.toLowerCase() === a.toLowerCase()))
              .slice(0, 4)
              .map((a) => (
                <button
                  key={`a-${a}`}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted"
                  onMouseDown={() => setLocation(a)}
                >
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{a}</span>
                </button>
              ))}
            {searching && (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">Searching the map…</div>
            )}
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
              { key: "coaches", label: "Coaches" },
              { key: "players", label: "Players" },
              { key: "parents", label: "Parents" },
            ] as const
          ).map((r) => (
            <div key={r.key} className="flex items-center justify-between px-3 py-2.5">
              <div className="text-sm font-semibold">{r.label}</div>
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
          rows={2}
        />
      </div>

      <Button
        className="w-full rounded-xl h-11 font-bold"
        disabled={!canSubmit}
        onClick={() => setConfirmingNotify(true)}
      >
        {eventDates.length > 1 ? `Create ${eventDates.length} events` : "Create event"}
      </Button>
    </div>
  );
}
