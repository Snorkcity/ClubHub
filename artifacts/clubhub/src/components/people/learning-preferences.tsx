import { useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Check, Eye, Headphones, RotateCcw } from "lucide-react";
import {
  useGetMyLearningPreferences,
  getGetMyLearningPreferencesQueryKey,
  useSubmitMyLearningPreferences,
  type LearningPreferences,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type LearningModality = "visual" | "auditory" | "kinesthetic";

const modalityMeta: Record<LearningModality, { label: string; detail: string; icon: typeof Eye; color: string; bar: string }> = {
  visual: { label: "Seeing it", detail: "Diagrams, demonstrations and watching a skill", icon: Eye, color: "text-sky-800", bar: "bg-sky-600" },
  auditory: { label: "Hearing it", detail: "Talking it through, cues and listening", icon: Headphones, color: "text-amber-800", bar: "bg-amber-500" },
  kinesthetic: { label: "Trying it", detail: "Movement, practice and hands-on repetition", icon: Activity, color: "text-emerald-800", bar: "bg-emerald-600" },
};

const questions: { prompt: string; choices: { text: string; modality: LearningModality }[] }[] = [
  { prompt: "When a coach shows a new play, what helps you get the shape of it?", choices: [{ text: "Seeing it drawn on a board or shown on the field", modality: "visual" }, { text: "Hearing the coach explain each player's job", modality: "auditory" }, { text: "Walking or running through the play myself", modality: "kinesthetic" }] },
  { prompt: "Before a match, how do you like to learn the plan?", choices: [{ text: "Look over a formation or a few key pictures", modality: "visual" }, { text: "Talk through the plan with my coach or teammates", modality: "auditory" }, { text: "Practise a few of the moves in a warm-up", modality: "kinesthetic" }] },
  { prompt: "When learning a new skill, what is a useful first step for you?", choices: [{ text: "Watch someone do it slowly", modality: "visual" }, { text: "Listen for a short cue that explains it", modality: "auditory" }, { text: "Have a go and adjust as I practise", modality: "kinesthetic" }] },
  { prompt: "If you forget where to move during a drill, what would help most?", choices: [{ text: "A marker or diagram showing the right spot", modality: "visual" }, { text: "A teammate calling out where to go", modality: "auditory" }, { text: "Repeating the drill until the movement feels familiar", modality: "kinesthetic" }] },
  { prompt: "How do you prefer a teammate to explain a new team routine?", choices: [{ text: "Show me the steps in order", modality: "visual" }, { text: "Say the steps out loud", modality: "auditory" }, { text: "Do the routine together once", modality: "kinesthetic" }] },
  { prompt: "What makes a coach's feedback easiest to remember?", choices: [{ text: "A quick sketch or a visible example", modality: "visual" }, { text: "A clear phrase I can repeat to myself", modality: "auditory" }, { text: "A chance to try the adjustment straight away", modality: "kinesthetic" }] },
  { prompt: "When you are learning a new position, what helps you picture your role?", choices: [{ text: "A map of the field and where I should be", modality: "visual" }, { text: "A conversation about what I need to notice", modality: "auditory" }, { text: "Playing a short practice game in that position", modality: "kinesthetic" }] },
  { prompt: "At practice, how do you like to learn a warm-up sequence?", choices: [{ text: "Follow the coach and watch each movement", modality: "visual" }, { text: "Listen as the coach names each movement", modality: "auditory" }, { text: "Join in and learn the order by doing it", modality: "kinesthetic" }] },
  { prompt: "If your team is deciding how to defend a corner, what helps you contribute?", choices: [{ text: "Seeing the players placed on a field diagram", modality: "visual" }, { text: "Talking through who marks whom", modality: "auditory" }, { text: "Trying the set-up with teammates", modality: "kinesthetic" }] },
  { prompt: "How would you rather remember a new coaching cue?", choices: [{ text: "Keep a short written note or picture", modality: "visual" }, { text: "Hear it and say it back", modality: "auditory" }, { text: "Use it during a drill until it sticks", modality: "kinesthetic" }] },
  { prompt: "When watching match footage, what do you focus on first?", choices: [{ text: "Where players are positioned", modality: "visual" }, { text: "What the coach or commentator is saying", modality: "auditory" }, { text: "How the movement might feel if I tried it", modality: "kinesthetic" }] },
  { prompt: "A drill has several steps. What is the easiest way for you to follow them?", choices: [{ text: "See the steps written or shown", modality: "visual" }, { text: "Hear the steps explained in order", modality: "auditory" }, { text: "Start the drill and learn each step as I go", modality: "kinesthetic" }] },
  { prompt: "When a teammate gives you directions, what do you appreciate?", choices: [{ text: "A point or gesture toward the right place", modality: "visual" }, { text: "A calm, clear explanation", modality: "auditory" }, { text: "They guide me through the movement", modality: "kinesthetic" }] },
  { prompt: "How would you choose to practise a new footwork pattern?", choices: [{ text: "Watch a few examples first", modality: "visual" }, { text: "Listen to the rhythm or count", modality: "auditory" }, { text: "Move through the pattern a few times", modality: "kinesthetic" }] },
  { prompt: "What helps you understand a referee's signal?", choices: [{ text: "Seeing the hand signal clearly", modality: "visual" }, { text: "Hearing the referee explain the call", modality: "auditory" }, { text: "Connecting the signal to what just happened in play", modality: "kinesthetic" }] },
  { prompt: "You are practising a pass. What kind of reminder works best?", choices: [{ text: "A picture showing the passing lane", modality: "visual" }, { text: "A short cue like 'look, step, pass'", modality: "auditory" }, { text: "Repeating the pass with a partner", modality: "kinesthetic" }] },
  { prompt: "When you are nervous before a game, what helps you settle in?", choices: [{ text: "Picture the first few moments of the game", modality: "visual" }, { text: "Talk with someone or listen to a steady voice", modality: "auditory" }, { text: "Move around and do a familiar warm-up", modality: "kinesthetic" }] },
  { prompt: "How do you like to learn your team's signals?", choices: [{ text: "Look at a chart showing each signal", modality: "visual" }, { text: "Hear the signal and its meaning explained", modality: "auditory" }, { text: "Practise responding to each signal", modality: "kinesthetic" }] },
  { prompt: "A coach is describing a change to your role. What would help you most?", choices: [{ text: "A simple diagram of the new position", modality: "visual" }, { text: "A chance to ask questions and talk it over", modality: "auditory" }, { text: "A short drill to try the role out", modality: "kinesthetic" }] },
  { prompt: "How do you most enjoy learning about another team's tactics?", choices: [{ text: "Reviewing their formation or match clips", modality: "visual" }, { text: "Listening to a coach explain what to expect", modality: "auditory" }, { text: "Practising how our team will respond", modality: "kinesthetic" }] },
  { prompt: "If you make the same mistake twice, what is a helpful next step?", choices: [{ text: "See a clear example of the correct movement", modality: "visual" }, { text: "Hear one simple thing to focus on", modality: "auditory" }, { text: "Slow the skill down and practise it again", modality: "kinesthetic" }] },
  { prompt: "What helps you remember where to meet your team on game day?", choices: [{ text: "A map or a photo of the meeting place", modality: "visual" }, { text: "Someone telling me the directions", modality: "auditory" }, { text: "Going there once with someone", modality: "kinesthetic" }] },
  { prompt: "When learning a celebration or team routine, what is most fun?", choices: [{ text: "Watching the sequence and copying it", modality: "visual" }, { text: "Following a count or someone calling it out", modality: "auditory" }, { text: "Jumping in and learning as we do it", modality: "kinesthetic" }] },
  { prompt: "How do you prefer to review what went well after a match?", choices: [{ text: "Look at photos, clips or a simple field map", modality: "visual" }, { text: "Talk about the moments with the team", modality: "auditory" }, { text: "Try a good moment again during the next practice", modality: "kinesthetic" }] },
  { prompt: "A new drill feels confusing. What would you ask for?", choices: [{ text: "A demonstration of the whole drill", modality: "visual" }, { text: "The instructions one step at a time", modality: "auditory" }, { text: "A slow first turn with a coach beside me", modality: "kinesthetic" }] },
  { prompt: "What helps you keep track of a training goal?", choices: [{ text: "A progress chart I can look at", modality: "visual" }, { text: "A regular check-in conversation", modality: "auditory" }, { text: "A practice target I can work toward each session", modality: "kinesthetic" }] },
  { prompt: "When a coach gives the team a short talk, what do you remember best?", choices: [{ text: "Examples shown on a board or screen", modality: "visual" }, { text: "The coach's words and key phrases", modality: "auditory" }, { text: "The part where we put the idea into action", modality: "kinesthetic" }] },
  { prompt: "How do you like to learn a safe way to land or fall?", choices: [{ text: "Watch the movement demonstrated carefully", modality: "visual" }, { text: "Listen to the safety steps before trying", modality: "auditory" }, { text: "Practise slowly on a safe surface with guidance", modality: "kinesthetic" }] },
  { prompt: "If you are helping a new player learn a drill, what would you do first?", choices: [{ text: "Show them where to stand and what to watch", modality: "visual" }, { text: "Explain the steps and answer questions", modality: "auditory" }, { text: "Join in and practise the drill together", modality: "kinesthetic" }] },
  { prompt: "After practice, what kind of reminder would help you prepare for next time?", choices: [{ text: "A note or picture of one thing to remember", modality: "visual" }, { text: "A quick conversation about the next focus", modality: "auditory" }, { text: "A simple activity to try before the next session", modality: "kinesthetic" }] },
];

function preferenceSummary(result: LearningPreferences) {
  const entries: [LearningModality, number][] = [
    ["visual", result.visualScore],
    ["auditory", result.auditoryScore],
    ["kinesthetic", result.kinestheticScore],
  ];
  const high = Math.max(...entries.map(([, score]) => score));
  const low = Math.min(...entries.map(([, score]) => score));
  if (high - low <= 2) {
    return { heading: "A mixed set of preferences", copy: "Your answers are close across all three approaches. You may enjoy a blend of seeing, hearing and trying things out." };
  }
  const leaders = entries.filter(([, score]) => high - score <= 2);
  if (leaders.length > 1) {
    return { heading: `A blend: ${leaders.map(([key]) => modalityMeta[key].label.toLowerCase()).join(" and ")}`, copy: "You may find that mixing these approaches helps you get comfortable with a new skill." };
  }
  const lead = leaders[0][0];
  const copy: Record<LearningModality, string> = {
    visual: "Seeing a skill, shape or example may be a useful starting point. Pair it with a quick explanation and a chance to practise.",
    auditory: "Talking through a skill or hearing a simple cue may be a useful starting point. Pair it with a demonstration and a chance to practise.",
    kinesthetic: "Getting moving and trying a skill may be a useful starting point. Pair it with a clear demonstration and a simple cue.",
  };
  return { heading: `${modalityMeta[lead].label} stands out today`, copy: copy[lead] };
}

export function LearningPreferenceResult({ result, coachView = false }: { result: LearningPreferences; coachView?: boolean }) {
  const summary = preferenceSummary(result);
  const scores: [LearningModality, number][] = [
    ["visual", result.visualScore],
    ["auditory", result.auditoryScore],
    ["kinesthetic", result.kinestheticScore],
  ];
  const suggestions: Record<LearningModality, string> = {
    visual: "Show a quick demonstration, field map or example.",
    auditory: "Use a short cue, explain one step, then check understanding.",
    kinesthetic: "Build in a safe, low-pressure chance to try the movement.",
  };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Preference snapshot</p>
        <h3 className="mt-2 text-xl font-bold tracking-tight">{summary.heading}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{summary.copy}</p>
        {coachView && <p className="mt-3 text-xs text-muted-foreground">Self-reported on {result.completedAt ? new Date(result.completedAt).toLocaleDateString() : "a previous visit"}.</p>}
      </div>
      <div className="space-y-4" aria-label="Preference scores">
        {scores.map(([key, score]) => {
          const meta = modalityMeta[key];
          const Icon = meta.icon;
          return (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className={`flex items-center gap-2 text-sm font-semibold ${meta.color}`}><Icon className="h-4 w-4" />{meta.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{score}/30</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`${meta.label} score`} aria-valuemin={0} aria-valuemax={30} aria-valuenow={score}>
                <div className={`h-full rounded-full ${meta.bar} transition-[width] duration-500`} style={{ width: `${(score / 30) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{coachView ? suggestions[key] : meta.detail}</p>
            </div>
          );
        })}
      </div>
      {!coachView && (
        <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          This is a self-reported snapshot of what may feel helpful right now — not a diagnosis or a fixed learner type. Different approaches can help in different moments.
        </p>
      )}
    </div>
  );
}

export function PlayerLearningPreferences() {
  const { data, isLoading, isError, refetch } = useGetMyLearningPreferences({
    query: { queryKey: getGetMyLearningPreferencesQueryKey() },
  });
  const submit = useSubmitMyLearningPreferences();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(LearningModality | undefined)[]>(() => Array(30).fill(undefined));
  const [submitError, setSubmitError] = useState("");

  const begin = () => {
    setAnswers(Array(30).fill(undefined));
    setStep(0);
    setSubmitError("");
    setActive(true);
  };
  const save = async () => {
    if (answers.length !== 30 || answers.some((answer) => !answer)) return;
    setSubmitError("");
    try {
      const result = await submit.mutateAsync({ data: { answers: answers as LearningModality[] } });
      queryClient.setQueryData(getGetMyLearningPreferencesQueryKey(), result);
      setActive(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We couldn't save your answers. Please try again.");
    }
  };

  if (isLoading) {
    return <Card className="space-y-4 rounded-3xl p-6 md:p-8"><div className="h-6 w-48 animate-pulse rounded-lg bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted" /></Card>;
  }

  return (
    <Card className="overflow-hidden rounded-3xl border shadow-sm">
      <div className="border-b bg-gradient-to-br from-primary/[0.08] via-transparent to-emerald-500/[0.07] p-6 md:p-8">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Activity className="h-5 w-5" /></div>
        <h2 className="text-xl font-bold tracking-tight">How I like to learn at practice</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">A quick check-in about what helps you pick up new skills. Choose what sounds most like you — there are no right or wrong answers.</p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">30 questions · about 5 minutes · only you can answer for yourself</p>
      </div>
      <div className="p-6 md:p-8">
        {isError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
            <p className="font-semibold">Your preferences could not be loaded.</p>
            <Button variant="outline" className="mt-3 rounded-xl" onClick={() => void refetch()}>Try again</Button>
          </div>
        ) : active ? (
          <div>
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Question {step + 1} of 30</span><span>{Math.round(((step + 1) / 30) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((step + 1) / 30) * 100}%` }} /></div>
            </div>
            <fieldset>
              <legend className="mb-4 text-lg font-bold leading-snug">{questions[step].prompt}</legend>
              <div className="grid gap-3">
                {[...questions[step].choices.slice(step % 3), ...questions[step].choices.slice(0, step % 3)].map((choice) => {
                  const selected = answers[step] === choice.modality;
                  return (
                    <button key={choice.text} type="button" aria-pressed={selected} onClick={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === step ? choice.modality : answer))} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40 hover:bg-muted/50"}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>{choice.text}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
              <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
              {step < questions.length - 1 ? (
                <Button className="h-11 rounded-xl px-5" onClick={() => setStep((current) => Math.min(questions.length - 1, current + 1))} disabled={!answers[step]}>Next<ArrowRight className="ml-2 h-4 w-4" /></Button>
              ) : (
                <Button className="h-11 rounded-xl px-5" onClick={() => void save()} disabled={answers.some((answer) => !answer) || submit.isPending}>
                  {submit.isPending ? "Saving your answers…" : "Finish check-in"}
                </Button>
              )}
            </div>
            {submitError && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{submitError}</p>}
            <p className="mt-4 text-center text-xs text-muted-foreground">Your answers stay on this device during this visit. You can go back and change any answer.</p>
          </div>
        ) : data?.completed ? (
          <div>
            <p className="mb-5 text-sm text-muted-foreground">Here is what you said works for you right now. Preferences can change with the skill, coach or moment.</p>
            <LearningPreferenceResult result={data} />
            <Button variant="outline" className="mt-5 min-h-11 rounded-xl" onClick={begin}><RotateCcw className="mr-2 h-4 w-4" />Retake check-in</Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
            <p className="font-semibold">Not filled in yet</p>
            <p className="mt-1 text-sm text-muted-foreground">This is just for your own coaching context. No parent or guardian can answer it for you.</p>
            <Button className="mt-4 h-11 rounded-xl" onClick={begin}>Start check-in<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </Card>
  );
}
