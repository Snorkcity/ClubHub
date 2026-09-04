import { useState, useEffect, useRef } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Check, CheckCircle2, Lock, Eye, AlertCircle, Save, HelpCircle, User, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  useGetDevelopmentCycle,
  getGetDevelopmentCycleQueryKey,
  useSaveDevelopmentAssessment,
  useSubmitDevelopmentCycle,
  useReleaseDevelopmentReports,
  type DevelopmentCycleDetail,
  type DevelopmentCyclePlayer,
  type DevelopmentAssessmentInput,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

const assessmentSchema = z.object({
  technical: z.number().min(1).max(5),
  tactical: z.number().min(1).max(5),
  physical: z.number().min(1).max(5),
  coachabilityMindset: z.number().min(1).max(5),
  effortConsistency: z.number().min(1).max(5),
  teamworkCommunication: z.number().min(1).max(5),
  attendanceReliability: z.number().min(1).max(5),
  strength: z.string().min(1, "Please provide a strength").max(2000),
  focus: z.string().min(1, "Please provide a focus area").max(2000),
  internalNotes: z.string().max(5000).optional().nullable(),
});

type AssessmentFormValues = z.infer<typeof assessmentSchema>;

export default function DevelopmentCycle() {
  const params = useParams();
  const cycleId = Number(params.cycleId);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);

  const { data: cycle, isLoading, error, refetch } = useGetDevelopmentCycle(cycleId, {
    query: { queryKey: getGetDevelopmentCycleQueryKey(cycleId) }
  });

  // Select first player by default if none selected
  useEffect(() => {
    if (cycle && !selectedPlayerId && cycle.players.length > 0) {
      setSelectedPlayerId(cycle.players[0].person.id);
    }
  }, [cycle, selectedPlayerId]);

  if (isLoading) return <LoadingScreen message="Loading cycle workspace..." />;
  if (error || !cycle) return <ErrorState onRetry={() => refetch()} />;

  const selectedPlayer = cycle.players.find(p => p.person.id === selectedPlayerId) || null;
  const isLocked = cycle.status !== "active";

  return (
    <div className="flex-1 flex flex-col h-screen md:h-auto md:min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b bg-card px-4 py-3 flex items-center justify-between gap-4 z-10 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={`/teams/${cycle.teamId}/development`}
            className="shrink-0 p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-display font-bold truncate">{cycle.title}</h1>
              {cycle.status === "released" && <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hidden sm:inline-flex"><Eye className="mr-1 h-3 w-3" /> Released</Badge>}
              {cycle.status === "submitted" && <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 hidden sm:inline-flex"><Lock className="mr-1 h-3 w-3" /> Locked</Badge>}
              {cycle.status === "active" && <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 hidden sm:inline-flex">Active</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {cycle.reportingPeriod} · {cycle.completedPlayers}/{cycle.totalPlayers} completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => setRubricOpen(true)}>
            <HelpCircle className="mr-2 h-4 w-4" /> Rubric
          </Button>
          <CycleActions cycle={cycle} />
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Player List (Sidebar) */}
        <div className={`md:w-80 shrink-0 border-r bg-muted/20 flex flex-col transition-transform ${selectedPlayerId && 'hidden md:flex'}`}>
          <div className="p-3 border-b bg-card shrink-0 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Players</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setRubricOpen(true)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {cycle.players.map(player => {
                const isSelected = player.person.id === selectedPlayerId;
                return (
                  <button
                    key={player.person.id}
                    onClick={() => setSelectedPlayerId(player.person.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                      isSelected ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "hover:bg-muted"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className={`h-10 w-10 border ${isSelected ? "border-primary-foreground/20" : "border-border/50"}`}>
                        <AvatarFallback className={isSelected ? "bg-primary-foreground/10 text-primary-foreground" : ""}>
                          {player.person.firstName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {player.complete && (
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                        {player.person.fullName}
                      </div>
                      <div className={`text-xs truncate ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {player.complete ? "Assessed" : "Needs assessment"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Assessment Area */}
        <div className={`flex-1 flex flex-col min-w-0 bg-background ${!selectedPlayerId && 'hidden md:flex'}`}>
          {selectedPlayer ? (
            <AssessmentForm 
              cycle={cycle} 
              player={selectedPlayer} 
              onBack={() => setSelectedPlayerId(null)}
              isLocked={isLocked}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <User className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium text-foreground">Select a player</p>
              <p className="text-sm">Choose a player from the list to begin their assessment.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={rubricOpen} onOpenChange={setRubricOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Grading Rubric</DialogTitle>
            <DialogDescription>
              Use these standard criteria for all ratings across the club.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-2">
              <div className="bg-muted/40 p-4 rounded-xl space-y-2 border">
                <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Rating Scale</h4>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <div className="font-bold text-red-600">1</div><div>Significant development required</div>
                  <div className="font-bold text-amber-600">2</div><div>Developing toward standard</div>
                  <div className="font-bold text-green-600">3</div><div>Meets expected standard</div>
                  <div className="font-bold text-blue-600">4</div><div>Above expected standard</div>
                  <div className="font-bold text-purple-600">5</div><div>Exceptional at this level</div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Categories</h4>
                {cycle.rubric.map(cat => (
                  <div key={cat.key} className="space-y-1">
                    <h5 className="font-bold text-foreground">{cat.label}</h5>
                    <p className="text-sm text-muted-foreground leading-relaxed">{cat.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CycleActions({ cycle }: { cycle: DevelopmentCycleDetail }) {
  const { toast } = useToast();
  const submitCycle = useSubmitDevelopmentCycle();
  const releaseReports = useReleaseDevelopmentReports();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  const canSubmit = cycle.capabilities.canSubmit && cycle.status === "active";
  const canRelease = cycle.capabilities.canRelease && cycle.status === "submitted";

  const allComplete = cycle.completedPlayers === cycle.totalPlayers;

  const handleSubmit = () => {
    submitCycle.mutate({ cycleId: cycle.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDevelopmentCycleQueryKey(cycle.id) });
        setSubmitOpen(false);
        toast({ title: "Cycle locked successfully" });
      }
    });
  };

  const handleRelease = () => {
    releaseReports.mutate({ cycleId: cycle.id }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getGetDevelopmentCycleQueryKey(cycle.id) });
        setReleaseOpen(false);
        toast({ title: "Reports released", description: `${res.reportCount} reports have been made available.` });
      }
    });
  };

  if (cycle.status === "released") {
    return <Badge variant="secondary" className="bg-blue-50 text-blue-700">All Done</Badge>;
  }

  return (
    <>
      {canSubmit && (
        <Button 
          variant={allComplete ? "default" : "secondary"}
          className={!allComplete ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : ""}
          onClick={() => setSubmitOpen(true)}
        >
          <Lock className="mr-2 h-4 w-4" /> Lock & Submit
        </Button>
      )}

      {canRelease && (
        <Button onClick={() => setReleaseOpen(true)}>
          <Eye className="mr-2 h-4 w-4" /> Release Reports
        </Button>
      )}

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock this cycle?</DialogTitle>
            <DialogDescription>
              {allComplete 
                ? "All players have been assessed. Locking the cycle will prevent further edits." 
                : `Wait! Only ${cycle.completedPlayers} of ${cycle.totalPlayers} players have been assessed. You cannot edit assessments after locking.`
              }
              {cycle.internalRecipient && " The internal report will be sent to the selected reviewer."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button
              variant="default"
              onClick={handleSubmit}
              disabled={submitCycle.isPending || !allComplete}
            >
              {submitCycle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, lock it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release reports to families?</DialogTitle>
            <DialogDescription>
              This will make the reports visible on player profiles for guardians and the players themselves. They will receive a notification.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseOpen(false)}>Cancel</Button>
            <Button variant="default" onClick={handleRelease} disabled={releaseReports.isPending}>
              {releaseReports.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release {cycle.completedPlayers} reports
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssessmentForm({ 
  cycle, 
  player, 
  onBack,
  isLocked
}: { 
  cycle: DevelopmentCycleDetail;
  player: DevelopmentCyclePlayer;
  onBack: () => void;
  isLocked: boolean;
}) {
  const { toast } = useToast();
  const saveAssessment = useSaveDevelopmentAssessment();
  const formRef = useRef<HTMLFormElement>(null);

  const defaultValues: AssessmentFormValues = {
    technical: player.assessment?.technical ?? 0,
    tactical: player.assessment?.tactical ?? 0,
    physical: player.assessment?.physical ?? 0,
    coachabilityMindset: player.assessment?.coachabilityMindset ?? 0,
    effortConsistency: player.assessment?.effortConsistency ?? 0,
    teamworkCommunication: player.assessment?.teamworkCommunication ?? 0,
    attendanceReliability: player.assessment?.attendanceReliability ?? 0,
    strength: player.assessment?.strength || "",
    focus: player.assessment?.focus || "",
    internalNotes: player.assessment?.internalNotes || "",
  };

  const form = useForm<AssessmentFormValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues,
  });

  // Reset form when player changes
  useEffect(() => {
    form.reset(defaultValues);
  }, [player.person.id]); // only re-run when the selected player ID changes

  const onSubmit = (data: AssessmentFormValues) => {
    saveAssessment.mutate({ cycleId: cycle.id, playerId: player.person.id, data }, {
      onSuccess: () => {
        // Optimistically update the cache so the checkmark appears immediately without refetch cascade
        queryClient.setQueryData(getGetDevelopmentCycleQueryKey(cycle.id), (old: any) => {
          if (!old) return old;
          const newPlayers = old.players.map((p: any) => {
            if (p.person.id === player.person.id) {
              return { ...p, complete: true, assessment: { ...p.assessment, ...data } };
            }
            return p;
          });
          const completedCount = newPlayers.filter((p: any) => p.complete).length;
          return { ...old, players: newPlayers, completedPlayers: completedCount };
        });
        toast({ title: "Saved", description: `Assessment for ${player.person.firstName} saved.` });
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <div className="shrink-0 p-4 border-b bg-card flex items-center justify-between sticky top-0 z-10 shadow-sm md:shadow-none">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden -ml-2 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10 border shadow-sm">
            <AvatarFallback>{player.person.firstName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-display font-bold text-lg leading-tight">{player.person.fullName}</h2>
            {player.assessment?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated {format(new Date(player.assessment.updatedAt), "MMM d, h:mm a")} by {player.assessment.updatedBy.firstName}
              </p>
            )}
          </div>
        </div>
        {cycle.capabilities.canEdit && !isLocked && (
          <Button 
            onClick={() => formRef.current?.requestSubmit()} 
            disabled={saveAssessment.isPending}
            className="shrink-0 rounded-xl"
          >
            {saveAssessment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 bg-muted/10">
        <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24">
          <Form {...form}>
            <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
              
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-lg font-display font-bold">Ratings</h3>
                  <span className="text-xs text-muted-foreground font-medium">
                    Use the same team-level standard for every player
                  </span>
                </div>
                
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
                  {cycle.rubric.map(cat => (
                    <FormField
                      key={cat.key}
                      control={form.control}
                      name={cat.key as keyof AssessmentFormValues}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex flex-col mb-2">
                            <FormLabel className="text-base">{cat.label}</FormLabel>
                            <span className="text-[11px] text-muted-foreground leading-snug mt-0.5 min-h-[2.5rem]">{cat.description}</span>
                          </div>
                          <FormControl>
                            <div className="flex items-center justify-between gap-2 p-1.5 bg-card border rounded-xl shadow-sm">
                              {[1, 2, 3, 4, 5].map((val) => {
                                const isSelected = field.value === val;
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    disabled={isLocked || !cycle.capabilities.canEdit}
                                    onClick={() => field.onChange(val)}
                                    className={`
                                      flex-1 h-10 rounded-lg text-sm font-bold transition-all
                                      ${isLocked || !cycle.capabilities.canEdit ? "cursor-not-allowed opacity-80" : "hover:bg-muted active:scale-95"}
                                      ${isSelected && val === 1 ? "bg-red-500 text-white shadow-sm ring-1 ring-red-600" : ""}
                                      ${isSelected && val === 2 ? "bg-amber-500 text-white shadow-sm ring-1 ring-amber-600" : ""}
                                      ${isSelected && val === 3 ? "bg-green-500 text-white shadow-sm ring-1 ring-green-600" : ""}
                                      ${isSelected && val === 4 ? "bg-blue-500 text-white shadow-sm ring-1 ring-blue-600" : ""}
                                      ${isSelected && val === 5 ? "bg-purple-500 text-white shadow-sm ring-1 ring-purple-600" : ""}
                                      ${!isSelected ? "bg-transparent text-muted-foreground hover:text-foreground" : ""}
                                    `}
                                  >
                                    {val}
                                  </button>
                                );
                              })}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="border-b pb-2">
                  <h3 className="text-lg font-display font-bold">Feedback</h3>
                  <p className="text-xs text-muted-foreground">This is visible to the family.</p>
                </div>
                
                <FormField
                  control={form.control}
                  name="strength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key Strength</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          disabled={isLocked || !cycle.capabilities.canEdit}
                          placeholder="What has the player done well this cycle?"
                          className="min-h-[100px] resize-y rounded-xl"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="focus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Focus Area</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          disabled={isLocked || !cycle.capabilities.canEdit}
                          placeholder="What should the player focus on improving?"
                          className="min-h-[100px] resize-y rounded-xl"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-6">
                <div className="border-b pb-2">
                  <h3 className="text-lg font-display font-bold flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" /> Internal Notes
                  </h3>
                  <p className="text-xs text-muted-foreground">Not visible to the player or family.</p>
                </div>
                
                <FormField
                  control={form.control}
                  name="internalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value || ""}
                          disabled={isLocked || !cycle.capabilities.canEdit}
                          placeholder="Private notes for staff..."
                          className="min-h-[100px] resize-y rounded-xl bg-muted/30"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </form>
          </Form>
        </div>
      </ScrollArea>
    </div>
  );
}
