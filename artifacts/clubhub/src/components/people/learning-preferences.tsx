import { useActiveTeam } from "@/lib/active-team";
import { useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Check, Eye, Headphones, RotateCcw } from "lucide-react";
import {
  useGetMyLearningPreferences,
  getGetMyLearningPreferencesQueryKey,
  useSubmitMyLearningPreferences,
  useGetMyCoachLearningPreferences,
  getGetMyCoachLearningPreferencesQueryKey,
  useSubmitMyCoachLearningPreferences,
  type LearningPreferences,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type LearningModality = "visual" | "auditory" | "kinesthetic";

const modalityMeta: Record<LearningModality, { label: string; detail: string; icon: typeof Eye; color: string; bar: string }> = {
  visual: { label: "Visual", detail: "Diagrams, maps, layouts and visual examples", icon: Eye, color: "text-sky-800", bar: "bg-sky-600" },
  auditory: { label: "Auditory", detail: "Clear spoken explanations, conversation and questions", icon: Headphones, color: "text-amber-800", bar: "bg-amber-500" },
  kinesthetic: { label: "Kinaesthetic", detail: "Hands-on practice and trying things out", icon: Activity, color: "text-emerald-800", bar: "bg-emerald-600" },
};

const questions: { prompt: string; choices: { text: string; modality: LearningModality }[] }[] = [
  { prompt: "A friend has sent you the address of a place you haven't visited. What do you do first?", choices: [{ text: "Check a map and pick out a landmark on the way", modality: "visual" }, { text: "Ask someone to talk me through the route", modality: "auditory" }, { text: "Set off and get my bearings along the way", modality: "kinesthetic" }] },
  { prompt: "You're trying a recipe you haven't made before. What sounds most useful?", choices: [{ text: "Look over the recipe and notice how the steps fit together", modality: "visual" }, { text: "Ask someone who has made it to talk me through it", modality: "auditory" }, { text: "Get started and adjust as I go", modality: "kinesthetic" }] },
  { prompt: "A friend offers to teach you a new card or board game. How do you usually get started?", choices: [{ text: "Look at an example of how a turn works", modality: "visual" }, { text: "Hear the rules and ask questions", modality: "auditory" }, { text: "Play a practice round", modality: "kinesthetic" }] },
  { prompt: "You're setting up a new app on your phone. What do you try first?", choices: [{ text: "Look through the screens and follow the layout", modality: "visual" }, { text: "Ask someone to explain what the settings do", modality: "auditory" }, { text: "Tap through the options and see what happens", modality: "kinesthetic" }] },
  { prompt: "You're choosing between a few places for a day out. What helps you decide?", choices: [{ text: "Compare a map or pictures of the places", modality: "visual" }, { text: "Talk with someone who has been there", modality: "auditory" }, { text: "Go and explore a place for myself", modality: "kinesthetic" }] },
  { prompt: "You meet someone briefly at a gathering. What might help you remember their name later?", choices: [{ text: "Connect it with their face or something distinctive", modality: "visual" }, { text: "Say the name aloud or hear it again", modality: "auditory" }, { text: "Remember what we did or talked about together", modality: "kinesthetic" }] },
  { prompt: "Your friends are deciding how to arrange a room. Where would you start?", choices: [{ text: "Sketch where things could go", modality: "visual" }, { text: "Talk through ideas with everyone", modality: "auditory" }, { text: "Move things around and see what works", modality: "kinesthetic" }] },
  { prompt: "You have a few things to remember before leaving home. What do you tend to do?", choices: [{ text: "Put them in a list or picture them together", modality: "visual" }, { text: "Say them out loud or ask someone to remind me", modality: "auditory" }, { text: "Collect each thing and put it by the door", modality: "kinesthetic" }] },
  { prompt: "A friend tells you about something funny that happened while you were away. What stays with you?", choices: [{ text: "The scene I picture from their description", modality: "visual" }, { text: "The way they tell the story", modality: "auditory" }, { text: "What it might have felt like to be there", modality: "kinesthetic" }] },
  { prompt: "Plans change just before a group outing. What helps you get back on track?", choices: [{ text: "Check the updated plan or route", modality: "visual" }, { text: "Talk through what has changed with someone", modality: "auditory" }, { text: "Start with the next step and adapt as I go", modality: "kinesthetic" }] },
  { prompt: "You want to find out how to look after an unfamiliar plant. What would you do?", choices: [{ text: "Look over a care guide or chart", modality: "visual" }, { text: "Ask someone who grows it to explain", modality: "auditory" }, { text: "Care for it and notice how it responds", modality: "kinesthetic" }] },
  { prompt: "You're helping to organise a small event. What part feels natural to take on?", choices: [{ text: "Make a simple plan so I can see what goes where", modality: "visual" }, { text: "Talk through jobs and timing with everyone", modality: "auditory" }, { text: "Start setting things up and adjust as needed", modality: "kinesthetic" }] },
  { prompt: "At a museum or gallery, what are you most likely to spend time with?", choices: [{ text: "Maps, displays or details I can look over", modality: "visual" }, { text: "A tour or conversation about the exhibits", modality: "auditory" }, { text: "An interactive exhibit I can try", modality: "kinesthetic" }] },
  { prompt: "Someone gives you several steps to follow later in the week. How do you keep them straight?", choices: [{ text: "Check a written list or sequence", modality: "visual" }, { text: "Talk through the timing and order", modality: "auditory" }, { text: "Start with the first step and work through them", modality: "kinesthetic" }] },
  { prompt: "You're comparing a few options for something you might buy. How do you decide?", choices: [{ text: "Put the differences side by side", modality: "visual" }, { text: "Talk the options over with someone", modality: "auditory" }, { text: "Try or handle the options where I can", modality: "kinesthetic" }] },
];

type QuestionnaireAnswer = LearningModality[] | "depends" | undefined;
const MIN_SCORED_QUESTIONS = 8;

function shuffledQuestionChoices() {
  return questions.map(({ choices }) => {
    const shuffled = [...choices];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  });
}

function preferenceSummary(result: LearningPreferences) {
  const entries: [LearningModality, number][] = [
    ["visual", result.visualScore],
    ["auditory", result.auditoryScore],
    ["kinesthetic", result.kinestheticScore],
  ];
  const high = Math.max(...entries.map(([, score]) => score));
  const low = Math.min(...entries.map(([, score]) => score));
  if (high - low <= 2) {
    return { heading: "A mix of approaches", copy: "Your answers point to a blend. What helps may depend on the situation and the information you are receiving." };
  }
  const leaders = entries.filter(([, score]) => high - score <= 2);
  if (leaders.length > 1) {
    return { heading: `A blend: ${leaders.map(([key]) => modalityMeta[key].label).join(" and ")}`, copy: "More than one approach may feel useful to you. You can let your coach know when one works better for a particular situation." };
  }
  const lead = leaders[0][0];
  const copy: Record<LearningModality, string> = {
    visual: "Seeing a diagram, layout or example may be a useful starting point. Other approaches may help too, depending on the situation.",
    auditory: "Talking something through or asking questions may be a useful starting point. Other approaches may help too, depending on the situation.",
    kinesthetic: "Trying an example or working through it hands-on may be a useful starting point. Other approaches may help too, depending on the situation.",
  };
  return { heading: `${modalityMeta[lead].label} stands out today`, copy: copy[lead] };
}

export function LearningPreferenceResult({ result, coachView = false, compact = false }: { result: LearningPreferences; coachView?: boolean; compact?: boolean }) {
  const summary = preferenceSummary(result);
  const scores: [LearningModality, number][] = [
    ["visual", result.visualScore],
    ["auditory", result.auditoryScore],
    ["kinesthetic", result.kinestheticScore],
  ];
  const suggestions: Record<LearningModality, string> = {
    visual: "Offer a simple diagram, layout or visual example.",
    auditory: "Talk through the key point and leave room for questions.",
    kinesthetic: "Include a safe, low-pressure chance to try an example.",
  };
  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      <div className={`rounded-2xl border border-primary/15 bg-primary/[0.045] ${compact ? "p-3" : "p-5"}`}>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Preference snapshot</p>
        <h3 className={`${compact ? "mt-1 text-base" : "mt-2 text-xl"} font-bold tracking-tight`}>{summary.heading}</h3>
        <p className={`${compact ? "mt-1 text-xs" : "mt-2 text-sm"} leading-relaxed text-muted-foreground`}>{summary.copy}</p>
        {coachView && <p className={`${compact ? "mt-2" : "mt-3"} text-xs text-muted-foreground`}>Self-reported on {result.completedAt ? new Date(result.completedAt).toLocaleDateString() : "a previous visit"}.</p>}
      </div>
      <div className={compact ? "space-y-3" : "space-y-4"} aria-label="Preference scores">
        {scores.map(([key, score]) => {
          const meta = modalityMeta[key];
          const Icon = meta.icon;
          return (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className={`flex items-center gap-2 text-sm font-semibold ${meta.color}`}><Icon className="h-4 w-4" />{meta.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{Math.round((score / 30) * 100)}%</span>
              </div>
              <div className={`${compact ? "h-2" : "h-2.5"} overflow-hidden rounded-full bg-muted`} role="meter" aria-label={`${meta.label} score`} aria-valuemin={0} aria-valuemax={30} aria-valuenow={score}>
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

type QuestionnaireAudience = "player" | "coach";

type QuestionnaireProps = {
  audience: QuestionnaireAudience;
  data?: LearningPreferences;
  isLoading: boolean;
  isError: boolean;
  isPending: boolean;
  refetch: () => unknown;
  saveAnswers: (answers: (LearningModality[] | "depends")[]) => Promise<LearningPreferences>;
};

export function PlayerLearningPreferences() {
  const { activeTeamId } = useActiveTeam();
  const key = [...getGetMyLearningPreferencesQueryKey(), { activeTeamId }];
  const { data, isLoading, isError, refetch } = useGetMyLearningPreferences({
    query: { queryKey: key },
  });
  const submit = useSubmitMyLearningPreferences();
  const saveAnswers = async (answers: (LearningModality[] | "depends")[]) => {
    const result = await submit.mutateAsync({ data: { answers } });
    queryClient.setQueryData(key, result);
    return result;
  };
  return (
    <LearningPreferencesQuestionnaire
      audience="player"
      data={data}
      isLoading={isLoading}
      isError={isError}
      isPending={submit.isPending}
      refetch={refetch}
      saveAnswers={saveAnswers}
    />
  );
}

export function CoachLearningPreferences() {
  const { data, isLoading, isError, refetch } = useGetMyCoachLearningPreferences({
    query: { queryKey: getGetMyCoachLearningPreferencesQueryKey() },
  });
  const submit = useSubmitMyCoachLearningPreferences();
  const saveAnswers = async (answers: (LearningModality[] | "depends")[]) => {
    const result = await submit.mutateAsync({ data: { answers } });
    queryClient.setQueryData(getGetMyCoachLearningPreferencesQueryKey(), result);
    return result;
  };
  return (
    <LearningPreferencesQuestionnaire
      audience="coach"
      data={data}
      isLoading={isLoading}
      isError={isError}
      isPending={submit.isPending}
      refetch={refetch}
      saveAnswers={saveAnswers}
    />
  );
}

function LearningPreferencesQuestionnaire({
  audience,
  data,
  isLoading,
  isError,
  isPending,
  refetch,
  saveAnswers,
}: QuestionnaireProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuestionnaireAnswer[]>(() => Array(questions.length).fill(undefined));
  const [choiceOrder, setChoiceOrder] = useState(() => questions.map((question) => question.choices));
  const [submitError, setSubmitError] = useState("");
  const scoredAnswerCount = answers.filter(Array.isArray).length;

  const begin = () => {
    setAnswers(Array(questions.length).fill(undefined));
    setChoiceOrder(shuffledQuestionChoices());
    setStep(0);
    setSubmitError("");
    setActive(true);
  };
  const save = async () => {
    if (
      answers.length !== questions.length ||
      answers.some((answer) => answer === undefined) ||
      scoredAnswerCount < MIN_SCORED_QUESTIONS
    ) return;
    setSubmitError("");
    try {
      await saveAnswers(answers as (LearningModality[] | "depends")[]);
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
        <h2 className="text-xl font-bold tracking-tight">How I like to take in new information</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          A short check-in about how you approach everyday situations. Choose any options that feel true for you, or choose “It depends.” There are no right or wrong answers; {audience === "player" ? "your responses help coaches find useful ways to explain new things." : "your responses help club admins find useful ways to support you as a coach."}
        </p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          15 everyday questions · about 3 minutes · only you can answer for yourself
          {audience === "coach" ? " · only you and club admins can see your result" : ""}
        </p>
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
                <span>Question {step + 1} of {questions.length}</span><span>{Math.round(((step + 1) / questions.length) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
            </div>
            <fieldset>
              <legend className="mb-2 text-lg font-bold leading-snug">{questions[step].prompt}</legend>
              <p className="mb-4 text-xs text-muted-foreground">Choose any that fit, or select “It depends.”</p>
              <div className="grid gap-3">
                {choiceOrder[step].map((choice) => {
                  const currentAnswer = answers[step];
                  const selected = Array.isArray(currentAnswer) && currentAnswer.includes(choice.modality);
                  return (
                    <button
                      key={choice.text}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setAnswers((current) => current.map((answer, answerIndex) => {
                        if (answerIndex !== step) return answer;
                        const selectedNow = Array.isArray(answer) ? answer : [];
                        const next = selectedNow.includes(choice.modality)
                          ? selectedNow.filter((modality) => modality !== choice.modality)
                          : [...selectedNow, choice.modality];
                        return next.length ? next : undefined;
                      }))}
                      className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40 hover:bg-muted/50"}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>{choice.text}
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={answers[step] === "depends"}
                  onClick={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === step ? (answer === "depends" ? undefined : "depends") : answer))}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${answers[step] === "depends" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40 hover:bg-muted/50"}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${answers[step] === "depends" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>{answers[step] === "depends" && <Check className="h-3.5 w-3.5" />}</span>
                  It depends on the situation, or none of these fit
                </button>
              </div>
            </fieldset>
            <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
              <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
              {step < questions.length - 1 ? (
                <Button className="h-11 rounded-xl px-5" onClick={() => setStep((current) => Math.min(questions.length - 1, current + 1))} disabled={answers[step] === undefined}>Next<ArrowRight className="ml-2 h-4 w-4" /></Button>
              ) : (
                <Button className="h-11 rounded-xl px-5" onClick={() => void save()} disabled={answers.some((answer) => answer === undefined) || scoredAnswerCount < MIN_SCORED_QUESTIONS || isPending}>
                  {isPending ? "Saving your answers…" : "Finish check-in"}
                </Button>
              )}
            </div>
            {step === questions.length - 1 && scoredAnswerCount < MIN_SCORED_QUESTIONS && (
              <p role="status" className="mt-3 text-center text-xs text-muted-foreground">
                Choose at least one option for {MIN_SCORED_QUESTIONS} questions to create a useful snapshot. “It depends” is fine for the rest.
              </p>
            )}
            {submitError && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{submitError}</p>}
            <p className="mt-4 text-center text-xs text-muted-foreground">You can go back and change any answer. Your choices are saved as a preference snapshot, not a fixed type.</p>
          </div>
        ) : data?.completed ? (
          <div>
            <p className="mb-5 text-sm text-muted-foreground">Here is what you said may help when you receive new information. Preferences can vary by situation and change over time.</p>
            <LearningPreferenceResult result={data} />
            <Button variant="outline" className="mt-5 min-h-11 rounded-xl" onClick={begin}><RotateCcw className="mr-2 h-4 w-4" />Retake check-in</Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
            <p className="font-semibold">Not filled in yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {audience === "player"
                ? "Your answers help coaches understand how to share new information with you. You need to complete it yourself; a parent or guardian cannot answer for you."
                : "Your answers help club admins understand how to support you as a coach. Only you and club admins can see this result."}
            </p>
            <Button className="mt-4 h-11 rounded-xl" onClick={begin}>Start check-in<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </Card>
  );
}
