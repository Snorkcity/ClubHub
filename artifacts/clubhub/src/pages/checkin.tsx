import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, ClipboardCheck, Flame, Pencil, Plus, Trash2, Dumbbell } from "lucide-react";
import {
  useGetCheckinStatus,
  getGetCheckinStatusQueryKey,
  useSubmitWellness,
  useSubmitRpe,
  useLogExtraSession,
  useDeleteExtraSession,
  type CheckinSubject,
  type PendingRpe,
  type ExtraSessionInputKind,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const WELLNESS_QUESTIONS = [
  { key: "sleepQuality", label: "Sleep quality", low: "Terrible", high: "Excellent" },
  { key: "energy", label: "Energy", low: "Exhausted", high: "Fresh" },
  { key: "soreness", label: "Muscle soreness", low: "Very sore", high: "None" },
  { key: "stress", label: "Stress", low: "Very stressed", high: "Relaxed" },
  { key: "mood", label: "Mood", low: "Down", high: "Great" },
] as const;
type WellnessKey = (typeof WELLNESS_QUESTIONS)[number]["key"];

const RPE_LABELS: Record<number, string> = {
  0: "Rest", 1: "Very, very easy", 2: "Easy", 3: "Moderate", 4: "Somewhat hard",
  5: "Hard", 6: "Hard +", 7: "Very hard", 8: "Very hard +", 9: "Near maximal", 10: "Maximal",
};

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function scaleColor(v: number, max: 5 | 10): string {
  const pct = v / max;
  if (max === 10) {
    // effort scale: green -> amber -> red
    if (pct <= 0.4) return "bg-green-500";
    if (pct <= 0.7) return "bg-amber-500";
    return "bg-red-500";
  }
  // wellness: red (1) -> green (5)
  if (pct <= 0.4) return "bg-red-500";
  if (pct <= 0.6) return "bg-amber-500";
  return "bg-green-500";
}

function WellnessForm({ subject, date }: { subject: CheckinSubject; date: string }) {
  const { toast } = useToast();
  const existing = subject.todayWellness;
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Partial<Record<WellnessKey, number>>>(
    existing
      ? {
          sleepQuality: existing.sleepQuality, energy: existing.energy,
          soreness: existing.soreness, stress: existing.stress, mood: existing.mood,
        }
      : {},
  );
  const submit = useSubmitWellness({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCheckinStatusQueryKey({ date }) });
        setEditing(false);
        toast({ title: "Check-in saved", description: "Nice one — see you tomorrow." });
      },
      onError: () => toast({ title: "Could not save", variant: "destructive" }),
    },
  });

  const complete = WELLNESS_QUESTIONS.every((q) => answers[q.key] != null);
  const showForm = !existing || editing;

  if (!showForm) {
    return (
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Wellness done for today</p>
            <p className="text-sm text-muted-foreground">
              {WELLNESS_QUESTIONS.map((q) => `${q.label.split(" ")[0]} ${existing[q.key]}`).join(" · ")}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Edit wellness">
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-5">
      <div>
        <h3 className="font-display font-bold text-lg">How are you feeling today?</h3>
        <p className="text-sm text-muted-foreground">Takes 15 seconds. 1 is rough, 5 is great.</p>
      </div>
      {WELLNESS_QUESTIONS.map((q) => (
        <div key={q.key}>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-sm font-medium">{q.label}</span>
            <span className="text-xs text-muted-foreground">
              {answers[q.key] != null ? `${answers[q.key]}/5` : `${q.low} → ${q.high}`}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [q.key]: v }))}
                className={`h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                  answers[q.key] === v
                    ? `${scaleColor(v, 5)} text-white shadow-sm`
                    : "bg-muted hover:bg-muted/70 text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button
        className="w-full rounded-xl h-12 text-base"
        disabled={!complete || submit.isPending}
        onClick={() =>
          submit.mutate({
            data: {
              entryDate: date,
              sleepQuality: answers.sleepQuality!,
              energy: answers.energy!,
              soreness: answers.soreness!,
              stress: answers.stress!,
              mood: answers.mood!,
              ...(subject.isSelf ? {} : { onBehalfOfPersonId: subject.person.id }),
            },
          })
        }
      >
        {submit.isPending ? "Saving..." : existing ? "Update check-in" : "Save check-in"}
      </Button>
    </div>
  );
}

function RpeCard({ subject, pending, date }: { subject: CheckinSubject; pending: PendingRpe; date: string }) {
  const { toast } = useToast();
  const [rpe, setRpe] = useState<number | null>(null);
  const submit = useSubmitRpe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCheckinStatusQueryKey({ date }) });
        toast({ title: "Effort logged", description: "Thanks — that helps the coaches manage your load." });
      },
      onError: () => toast({ title: "Could not save", variant: "destructive" }),
    },
  });
  const event = pending.event;
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <Flame className="h-5 w-5 text-orange-600" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{event.title}</p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(event.startsAt), "EEE d MMM, h:mma")} · {pending.defaultMinutes} min
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto capitalize shrink-0">{event.type}</Badge>
      </div>
      <div>
        <p className="text-sm font-medium mb-1.5">How hard was that session?</p>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, v) => (
            <button
              key={v}
              type="button"
              onClick={() => setRpe(v)}
              className={`h-10 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                rpe === v
                  ? `${scaleColor(v, 10)} text-white shadow-sm`
                  : "bg-muted hover:bg-muted/70 text-muted-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 h-4">
          {rpe != null ? RPE_LABELS[rpe] : "0 = rest · 10 = hardest ever"}
        </p>
      </div>
      <Button
        className="w-full rounded-xl h-11"
        disabled={rpe == null || submit.isPending}
        onClick={() =>
          submit.mutate({
            eventId: event.id,
            data: {
              rpe: rpe!,
              ...(subject.isSelf ? {} : { onBehalfOfPersonId: subject.person.id }),
            },
          })
        }
      >
        {submit.isPending ? "Saving..." : "Log effort"}
      </Button>
    </div>
  );
}

const EXTRA_KINDS: { value: ExtraSessionInputKind; label: string }[] = [
  { value: "rep", label: "Rep / academy" },
  { value: "school", label: "School sport" },
  { value: "other", label: "Other" },
];

function ExtraSessions({ subject, date }: { subject: CheckinSubject; date: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExtraSessionInputKind>("rep");
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [rpe, setRpe] = useState<number | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCheckinStatusQueryKey({ date }) });

  const create = useLogExtraSession({
    mutation: {
      onSuccess: () => {
        invalidate();
        setOpen(false);
        setLabel("");
        setRpe(null);
        toast({ title: "Extra session logged", description: "It now counts toward the workload picture." });
      },
      onError: () => toast({ title: "Could not save", variant: "destructive" }),
    },
  });
  const remove = useDeleteExtraSession({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Could not delete", variant: "destructive" }),
    },
  });

  const recent = subject.recentExtraSessions ?? [];

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
          <Dumbbell className="h-5 w-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Played or trained outside the club?</p>
          <p className="text-sm text-muted-foreground">Rep squad, school sport — it all counts.</p>
        </div>
        {!open && (
          <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Log
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <ul className="space-y-2">
          {recent.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium capitalize shrink-0">
                {EXTRA_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}
              </span>
              <span className="text-muted-foreground truncate">
                {format(new Date(`${s.sessionDate}T12:00:00`), "EEE d MMM")} · {s.minutes} min · RPE {s.rpe}
                {s.label ? ` · ${s.label}` : ""}
              </span>
              <button
                type="button"
                aria-label="Delete extra session"
                className="ml-auto text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => remove.mutate({ extraSessionId: s.id })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-4 pt-1">
          <div className="flex gap-2 flex-wrap">
            {EXTRA_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  kind === k.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="What was it? (optional)"
            className="w-full h-11 rounded-xl border bg-background px-3 text-sm"
          />
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium">How long?</span>
              <span className="text-xs text-muted-foreground">{minutes} min</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`h-10 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                    minutes === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted hover:bg-muted/70 text-muted-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-1.5">How hard was it?</p>
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRpe(v)}
                  className={`h-10 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                    rpe === v
                      ? `${scaleColor(v, 10)} text-white shadow-sm`
                      : "bg-muted hover:bg-muted/70 text-muted-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 h-4">
              {rpe != null ? RPE_LABELS[rpe] : "0 = rest · 10 = hardest ever"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl flex-[2]"
              disabled={rpe == null || create.isPending}
              onClick={() =>
                create.mutate({
                  data: {
                    sessionDate: date,
                    kind,
                    rpe: rpe!,
                    minutes,
                    ...(label.trim() ? { label: label.trim() } : {}),
                    ...(subject.isSelf ? {} : { onBehalfOfPersonId: subject.person.id }),
                  },
                })
              }
            >
              {create.isPending ? "Saving..." : "Log session"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekStrip({ subject }: { subject: CheckinSubject }) {
  const days = useMemo(() => {
    const out: { date: string; label: string; avg: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = format(d, "yyyy-MM-dd");
      const entry = subject.weekWellness.find((w) => w.entryDate === ds);
      const avg = entry
        ? (entry.sleepQuality + entry.energy + entry.soreness + entry.stress + entry.mood) / 5
        : null;
      out.push({ date: ds, label: format(d, "EEEEE"), avg });
    }
    return out;
  }, [subject.weekWellness]);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium mb-3">Your last 7 days</p>
      <div className="flex justify-between">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1.5">
            <div
              className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold ${
                d.avg == null
                  ? "bg-muted text-muted-foreground/50"
                  : `${scaleColor(Math.round(d.avg), 5)} text-white`
              }`}
            >
              {d.avg == null ? "–" : d.avg.toFixed(1)}
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Checkin() {
  const date = todayStr();
  const { data, isLoading, error, refetch } = useGetCheckinStatus(
    { date },
    { query: { queryKey: getGetCheckinStatusQueryKey({ date }) } },
  );
  const [activeIdx, setActiveIdx] = useState(0);

  if (isLoading) return <LoadingScreen message="Loading your check-in..." />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;

  const subjects = data.subjects;
  if (subjects.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
        <div className="container mx-auto p-4 md:p-8 lg:max-w-2xl">
          <EmptyState
            title="No check-in needed"
            message="Daily check-ins are for players. If you're a parent, they'll appear here once your player is on a team roster."
            icon={ClipboardCheck}
          />
        </div>
      </div>
    );
  }

  const active = subjects[Math.min(activeIdx, subjects.length - 1)];

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-2xl space-y-5">
        <header>
          <h1 className="text-3xl font-display font-bold tracking-tight">Check-in</h1>
          <p className="text-muted-foreground mt-1">{format(new Date(), "EEEE, MMMM d")}</p>
        </header>

        {subjects.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {subjects.map((s, i) => (
              <button
                key={s.person.id}
                onClick={() => setActiveIdx(i)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  i === activeIdx
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.isSelf ? "Me" : s.person.firstName}
              </button>
            ))}
          </div>
        )}

        {active.pendingRpe.map((p) => (
          <RpeCard key={`${active.person.id}:${p.event.id}`} subject={active} pending={p} date={date} />
        ))}

        <WellnessForm key={`${active.person.id}:${active.todayWellness?.id ?? "new"}`} subject={active} date={date} />

        <ExtraSessions key={`extra:${active.person.id}`} subject={active} date={date} />

        <WeekStrip subject={active} />
      </div>
    </div>
  );
}
