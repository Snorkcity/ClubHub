import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, MapPin, Check, Search, Repeat } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  getGetMeQueryKey,
  useListTeams,
  getListTeamsQueryKey,
  useCreateEvent,
  useUpdateEvent,
  getListUpcomingEventsQueryKey,
  getGetEventQueryKey,
  useListMyEventLocations,
  getListMyEventLocationsQueryKey,
  useCreatePost,
  getListTeamPostsQueryKey,
} from "@workspace/api-client-react";
import { format, parse } from "date-fns";

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
const ARRIVE_RE = /^Players to arrive by (\d{1,2}:\d{2}\s?(?:am|pm))\.\s*/i;

export type EventFormInitial = {
  type?: string;
  title?: string;
  date?: string; // yyyy-MM-dd
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  opponent?: string;
  location?: string;
  notes?: string;
  invitedRoles?: string[];
};

/** Build prefill values from an existing event (for edit / duplicate). */
export function initialFromEvent(event: {
  type: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  opponent?: string | null;
  location?: string | null;
  notes?: string | null;
  invitedRoles?: string[];
}, keepDate: boolean): EventFormInitial {
  const start = new Date(event.startsAt);
  return {
    type: event.type,
    title: event.title,
    ...(keepDate ? { date: format(start, "yyyy-MM-dd") } : {}),
    startTime: format(start, "HH:mm"),
    ...(event.endsAt ? { endTime: format(new Date(event.endsAt), "HH:mm") } : {}),
    opponent: event.opponent ?? "",
    location: event.location ?? "",
    notes: event.notes ?? "",
    invitedRoles: event.invitedRoles ?? ["coaches", "players", "parents"],
  };
}

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
          data.map((d) => d.display_name.split(", ").slice(0, 4).join(", ")),
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
        <EventForm teams={staffTeams} mode="create" onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Controlled dialog for editing or duplicating an existing event. */
export function EventEditorDialog({
  open,
  onOpenChange,
  mode,
  eventId,
  teamId,
  teamName,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  eventId?: number;
  teamId: number;
  teamName: string;
  initial: EventFormInitial;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit event" : "Duplicate event"}</DialogTitle>
        </DialogHeader>
        {open && (
          <EventForm
            teams={[{ id: teamId, name: teamName }]}
            mode={mode}
            eventId={eventId}
            initial={initial}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Split a stored notes string into { arriveBy (HH:mm), rest } for games. */
function splitArriveNotes(notes: string): { arriveBy: string; rest: string } {
  const m = notes.match(ARRIVE_RE);
  if (!m) return { arriveBy: "", rest: notes };
  try {
    const t = parse(m[1].replace(/\s/g, "").toLowerCase(), "h:mma", new Date());
    return { arriveBy: format(t, "HH:mm"), rest: notes.replace(ARRIVE_RE, "") };
  } catch {
    return { arriveBy: "", rest: notes };
  }
}

function EventForm({
  teams,
  mode,
  eventId,
  initial,
  onDone,
}: {
  teams: { id: number; name: string }[];
  mode: "create" | "edit";
  eventId?: number;
  initial?: EventFormInitial;
  onDone: () => void;
}) {
  const initGame = initial?.type === "game";
  const initNotesSplit = initGame
    ? splitArriveNotes(initial?.notes ?? "")
    : { arriveBy: "", rest: initial?.notes ?? "" };

  const [teamId, setTeamId] = useState<string>(
    teams.length === 1 ? String(teams[0].id) : "",
  );
  const [type, setType] = useState<string>(initial?.type ?? "training");
  const [title, setTitle] = useState(initial?.title ?? DEFAULT_TITLES.training);
  const [titleTouched, setTitleTouched] = useState(!!initial?.title);
  const [date, setDate] = useState(initial?.date ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [duration, setDuration] = useState<string>(initial?.endTime ? "custom" : "60");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [arriveBy, setArriveBy] = useState(initNotesSplit.arriveBy);
  const [opponent, setOpponent] = useState(initial?.opponent ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [locationFocused, setLocationFocused] = useState(false);
  const [notes, setNotes] = useState(
    initial !== undefined ? initNotesSplit.rest : DEFAULT_NOTES,
  );
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [invited, setInvited] = useState<Record<string, boolean>>({
    coaches: initial ? (initial.invitedRoles ?? []).includes("coaches") : true,
    players: initial ? (initial.invitedRoles ?? []).includes("players") : true,
    parents: initial ? (initial.invitedRoles ?? []).includes("parents") : false,
  });
  const [confirmingNotify, setConfirmingNotify] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isGame = type === "game";

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
  const updateEvent = useUpdateEvent();
  const createPost = useCreatePost();

  const pickType = (t: string) => {
    const wasGame = type === "game";
    setType(t);
    if (!titleTouched) setTitle(DEFAULT_TITLES[t] ?? "");
    // Games use the arrive-by picker instead of the notes prefill.
    if (t === "game" && notes === DEFAULT_NOTES) setNotes("");
    if (wasGame && t !== "game" && notes.trim() === "") setNotes(DEFAULT_NOTES);
  };

  const effectiveEndTime = isGame
    ? ""
    : duration === "custom"
      ? endTime
      : startTime
        ? addMinutes(startTime, Number(duration))
        : "";

  const q = location.trim().toLowerCase();
  const recentMatches = (recentLocations ?? []).filter(
    (l) => !q || l.toLowerCase().includes(q),
  );
  const exactMatch = (recentLocations ?? []).some((l) => l.toLowerCase() === q);

  const invitedRoles = (["coaches", "players", "parents"] as const).filter(
    (r) => invited[r],
  );

  // Dates this event will be created for (weekly repeats, non-games only).
  const eventDates = useMemo(() => {
    if (!date) return [];
    if (isGame || mode === "edit" || !repeatWeekly || !repeatUntil) return [date];
    const dates: string[] = [];
    const end = new Date(`${repeatUntil}T23:59:59`);
    let d = new Date(`${date}T12:00:00`);
    while (d <= end && dates.length < 26) {
      dates.push(format(d, "yyyy-MM-dd"));
      d = new Date(d.getTime() + 7 * 24 * 3600 * 1000);
    }
    return dates;
  }, [date, repeatWeekly, repeatUntil, isGame, mode]);

  const canSubmit =
    teamId !== "" && title.trim() !== "" && eventDates.length > 0 &&
    startTime !== "" && invitedRoles.length > 0 && !submitting &&
    (isGame || duration !== "custom" || endTime !== "");

  const userNotes = notes.trim() === DEFAULT_NOTES.trim() ? "" : notes.trim();
  const arriveLine =
    isGame && arriveBy
      ? `Players to arrive by ${format(new Date(`2000-01-01T${arriveBy}`), "h:mma").toLowerCase()}. `
      : "";
  const finalNotes = `${arriveLine}${userNotes}`.trim();

  const buildPayload = (d: string) => {
    const startsAt = new Date(`${d}T${startTime}`);
    const endsAt =
      !isGame && effectiveEndTime ? new Date(`${d}T${effectiveEndTime}`) : null;
    return {
      type: type as "training" | "game" | "other",
      title: title.trim(),
      startsAt: startsAt.toISOString(),
      ...(endsAt && endsAt > startsAt ? { endsAt: endsAt.toISOString() } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(isGame && opponent.trim() ? { opponent: opponent.trim() } : {}),
      ...(finalNotes ? { notes: finalNotes } : {}),
      invitedRoles,
    };
  };

  const doSubmit = async (notify: boolean) => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const tid = Number(teamId);
      if (mode === "edit" && eventId) {
        await updateEvent.mutateAsync({ eventId, data: buildPayload(eventDates[0]) });
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      } else {
        for (const d of eventDates) {
          await createEvent.mutateAsync({ teamId: tid, data: buildPayload(d) });
        }
      }
      if (notify) {
        const first = new Date(`${eventDates[0]}T${startTime}`);
        const when = format(first, "EEEE d MMMM, h:mmaaa");
        const repeatLine =
          eventDates.length > 1
            ? ` Repeats weekly (${eventDates.length} sessions) until ${format(new Date(`${eventDates[eventDates.length - 1]}T12:00:00`), "d MMMM")}.`
            : "";
        const heading = mode === "edit" ? "Updated event" : "New event";
        await createPost.mutateAsync({
          teamId: tid,
          data: {
            title: `${heading}: ${title.trim()}`,
            body: `${title.trim()} — ${when}${location.trim() ? ` at ${location.trim()}` : ""}.${repeatLine}${finalNotes ? ` ${finalNotes}` : ""} Please check the Schedule page.`,
          },
        });
        queryClient.invalidateQueries({ queryKey: getListTeamPostsQueryKey(tid) });
      }
      queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
      toast({
        title:
          mode === "edit"
            ? "Event updated"
            : eventDates.length > 1
              ? `${eventDates.length} events created`
              : "Event created",
        ...(notify ? { description: "The team has been notified in the feed." } : {}),
      });
      onDone();
    } catch {
      toast({
        title: mode === "edit" ? "Couldn't save the changes" : "Couldn't create the event",
        variant: "destructive",
      });
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
          {mode === "edit"
            ? "Save changes and notify the team?"
            : eventDates.length > 1
              ? `Create ${eventDates.length} events and notify the team?`
              : "Notify everyone invited?"}
        </p>
        <p className="text-sm text-muted-foreground">
          Notifying posts an announcement to the team feed with the event details.
        </p>
        <div className="space-y-2">
          <Button className="w-full rounded-xl h-11 font-bold" disabled={submitting} onClick={() => doSubmit(true)}>
            {submitting ? "Saving…" : mode === "edit" ? "Save & notify team" : "Create & notify team"}
          </Button>
          <Button variant="outline" className="w-full rounded-xl h-11 font-bold" disabled={submitting} onClick={() => doSubmit(false)}>
            {mode === "edit" ? "Save without notifying" : "Create without notifying"}
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

      {isGame && (
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
          <Input className="min-w-0 w-full" id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-start">{isGame ? "Kick-off time" : "Start time"}</Label>
          <Input className="min-w-0 w-full" id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
      </div>

      {isGame ? (
        <div className="space-y-1.5">
          <Label htmlFor="ev-arrive">Players to arrive by</Label>
          <Input className="min-w-0 w-full" id="ev-arrive" type="time" value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} />
        </div>
      ) : (
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
              <Input className="min-w-0 w-full" id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          ) : (
            startTime && (
              <p className="text-xs text-muted-foreground -mt-2">
                Ends at {format(new Date(`2000-01-01T${effectiveEndTime}`), "h:mm a")}
              </p>
            )
          )}
        </div>
      )}

      {!isGame && mode === "create" && (
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
              <Input className="min-w-0 w-full" id="ev-until" type="date" value={repeatUntil} min={date} onChange={(e) => setRepeatUntil(e.target.value)} />
              {eventDates.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {eventDates.length} sessions, same time each week.
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
        {mode === "edit"
          ? "Save changes"
          : eventDates.length > 1
            ? `Create ${eventDates.length} events`
            : "Create event"}
      </Button>
    </div>
  );
}
