import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { ArrowLeft, Save, Lock, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  useSaveDevelopmentAssessment,
  getGetDevelopmentCycleQueryKey,
  type DevelopmentCycleDetail,
  type DevelopmentCyclePlayer,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

export const assessmentSchema = z.object({
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

export function AssessmentForm({
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