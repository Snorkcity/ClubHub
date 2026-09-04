import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Info, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  useSaveDevelopmentReportDraft,
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

export function WordingForm({
  cycle,
  player,
  onBack
}: {
  cycle: DevelopmentCycleDetail;
  player: DevelopmentCyclePlayer;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const saveDraft = useSaveDevelopmentReportDraft();
  const formRef = useRef<HTMLFormElement>(null);

  const draft = player.reportDraft;
  const isReleased = cycle.status === "released";
  const canEdit = cycle.capabilities.canReviewReports && !isReleased;

  // We map the array of categories to a dynamic form object for React Hook Form
  const formValues = {
    strength: draft?.strength || "",
    focus: draft?.focus || "",
    ...draft?.categories.reduce((acc, cat) => ({
      ...acc,
      [`category_${cat.key}`]: cat.narrative
    }), {})
  };

  const WordingSchema = z.object({
    strength: z.string().min(1, "Required").max(2000),
    focus: z.string().min(1, "Required").max(2000),
    ...draft?.categories.reduce((acc, cat) => ({
      ...acc,
      [`category_${cat.key}`]: z.string().min(1, "Required").max(1000)
    }), {})
  });

  const form = useForm<any>({
    resolver: zodResolver(WordingSchema),
    defaultValues: formValues,
  });

  useEffect(() => {
    form.reset(formValues);
  }, [player.person.id, draft]);

  const onSubmit = (data: any) => {
    const categories = draft?.categories.map(c => ({
      key: c.key,
      narrative: data[`category_${c.key}`]
    })) || [];

    saveDraft.mutate({
      cycleId: cycle.id,
      playerId: player.person.id,
      data: {
        categories,
        strength: data.strength,
        focus: data.focus
      }
    }, {
      onSuccess: (updatedDraft) => {
        queryClient.setQueryData(getGetDevelopmentCycleQueryKey(cycle.id), (old: any) => {
          if (!old) return old;
          let newlyReviewed = false;
          const newPlayers = old.players.map((p: any) => {
            if (p.person.id === player.person.id) {
              if (!p.reportDraft?.reviewedAt) newlyReviewed = true;
              return { ...p, reportDraft: updatedDraft };
            }
            return p;
          });
          return {
            ...old, 
            players: newPlayers,
            reviewedReports: newlyReviewed ? old.reviewedReports + 1 : old.reviewedReports
          };
        });
        toast({ title: "Draft reviewed and saved", description: `Wording for ${player.person.firstName} is ready.` });
      }
    });
  };

  if (!draft) return null;

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
            {draft.reviewedAt ? (
              <p className="text-xs text-green-600 font-medium">Reviewed on {format(new Date(draft.reviewedAt), "MMM d, h:mm a")}</p>
            ) : (
              <p className="text-xs text-amber-600 font-medium">Generated draft needs review</p>
            )}
          </div>
        </div>
        {canEdit && (
          <Button 
            onClick={() => formRef.current?.requestSubmit()} 
            disabled={saveDraft.isPending}
            className="shrink-0 rounded-xl"
          >
            {saveDraft.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Review & save
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 bg-muted/10">
        <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 space-y-8">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm leading-relaxed border border-blue-100 flex gap-3">
            <Info className="h-5 w-5 shrink-0 text-blue-600" />
            <p>Review the generated wording for the family report. You can edit any sentence to ensure it strikes the right tone before releasing.</p>
          </div>

          <Form {...form}>
            <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-6">
                <div className="border-b pb-2">
                  <h3 className="text-lg font-display font-bold">Key Feedback</h3>
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
                          disabled={!canEdit}
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
                          disabled={!canEdit}
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
                  <h3 className="text-lg font-display font-bold">Category Narratives</h3>
                </div>
                
                {draft.categories.map(cat => (
                  <FormField
                    key={cat.key}
                    control={form.control}
                    name={`category_${cat.key}`}
                    render={({ field }) => (
                      <FormItem className="bg-card p-4 rounded-2xl border shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <FormLabel className="text-base m-0">{cat.label}</FormLabel>
                          <div className="shrink-0 flex items-center justify-center font-bold text-xs h-6 px-2.5 rounded-md bg-muted text-muted-foreground border">
                            Score: {cat.score}/5
                          </div>
                        </div>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            disabled={!canEdit}
                            className="min-h-[80px] resize-y rounded-xl bg-muted/30 border-transparent focus:bg-background focus:border-primary"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </form>
          </Form>
        </div>
      </ScrollArea>
    </div>
  );
}