import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, TrendingUp, Plus, CheckCircle2, Lock, Eye, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  useGetTeam,
  getGetTeamQueryKey,
  useListDevelopmentCycles,
  getListDevelopmentCyclesQueryKey,
  useCreateDevelopmentCycle,
  useListPeople,
  getListPeopleQueryKey,
  useListDevelopmentRecipientCandidates,
  getListDevelopmentRecipientCandidatesQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const startCycleSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  reportingPeriod: z.string().min(1, "Period is required").max(120),
  assessorIds: z.array(z.number()).min(1, "Select at least one assessor"),
  internalRecipientId: z.coerce.number().optional().nullable(),
});

type StartCycleFormValues = z.infer<typeof startCycleSchema>;

function StartCycleDialog({ 
  teamId, 
  open, 
  onOpenChange,
  onSuccess 
}: { 
  teamId: number; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: (cycleId: number) => void;
}) {
  const { data: people } = useListPeople({ teamId }, {
    query: { enabled: open, queryKey: getListPeopleQueryKey({ teamId }) }
  });
  const { data: recipientCandidates } = useListDevelopmentRecipientCandidates(teamId, {
    query: { enabled: open, queryKey: getListDevelopmentRecipientCandidatesQueryKey(teamId) }
  });

  const staff = people?.filter(p => p.teamRoles.some(r => r === "coach" || r === "manager")) || [];

  const createCycle = useCreateDevelopmentCycle();

  const form = useForm<StartCycleFormValues>({
    resolver: zodResolver(startCycleSchema),
    defaultValues: {
      title: "",
      reportingPeriod: "",
      assessorIds: [],
      internalRecipientId: null,
    },
  });

  function onSubmit(data: StartCycleFormValues) {
    createCycle.mutate({ teamId, data }, {
      onSuccess: (newCycle) => {
        queryClient.invalidateQueries({ queryKey: getListDevelopmentCyclesQueryKey(teamId) });
        form.reset();
        onSuccess(newCycle.id);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) form.reset();
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Development Cycle</DialogTitle>
          <DialogDescription>
            Create a new assessment cycle for this team. You'll be able to review and grade players before releasing reports to families.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cycle Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Mid-Season Review 2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reportingPeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reporting Period</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Jan - Jun 2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assessorIds"
              render={() => (
                <FormItem>
                  <FormLabel>Assessors</FormLabel>
                  <div className="text-[11px] text-muted-foreground mb-2">
                    Staff who can fill out these assessments. They'll share a single workspace.
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-1">
                    {staff.map((person) => (
                      <FormField
                        key={person.id}
                        control={form.control}
                        name="assessorIds"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={person.id}
                              className="flex flex-row items-center space-x-3 space-y-0 rounded-xl border p-3 bg-card"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(person.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, person.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== person.id
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <div className="flex items-center gap-2 font-normal">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={person.avatarUrl || undefined} />
                                  <AvatarFallback>{person.firstName?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-semibold">{person.fullName}</span>
                              </div>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                    {staff.length === 0 && (
                      <div className="text-sm text-muted-foreground italic p-2">
                        No team staff found.
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="internalRecipientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Reviewer (Optional)</FormLabel>
                  <div className="text-[11px] text-muted-foreground mb-2">
                    A technical director or head coach who should receive a copy of all internal notes once the cycle is locked.
                  </div>
                  <Select 
                    onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v, 10))} 
                    value={field.value ? String(field.value) : "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reviewer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(recipientCandidates ?? []).map(person => (
                        <SelectItem key={person.id} value={String(person.id)}>
                          {person.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="submit" disabled={createCycle.isPending} className="w-full sm:w-auto">
                {createCycle.isPending ? "Starting..." : "Start Cycle"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamDevelopment() {
  const params = useParams();
  const teamId = Number(params.teamId);
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: me } = useGetMe();
  const { data: team, isLoading: isLoadingTeam } = useGetTeam(teamId, {
    query: { queryKey: getGetTeamQueryKey(teamId) }
  });
  
  const { data: cycles, isLoading: isLoadingCycles, error, refetch } = useListDevelopmentCycles(teamId, {
    query: { queryKey: getListDevelopmentCyclesQueryKey(teamId) }
  });

  const isStaff = me?.isClubAdmin || me?.memberships?.some(m => m.teamId === teamId && (m.role === "coach" || m.role === "manager"));

  if (isLoadingTeam || isLoadingCycles) return <LoadingScreen message="Loading player development..." />;
  if (error || !team || !cycles) return <ErrorState onRetry={() => refetch()} />;

  const activeCycles = cycles.filter(c => c.status === "active");
  const pastCycles = cycles.filter(c => c.status !== "active");

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 max-w-4xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <Link
              href={`/teams/${teamId}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to {team.name}
            </Link>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
              <TrendingUp className="h-7 w-7 text-primary" />
              Player Development
            </h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base max-w-2xl">
              Constructive, fair, and clear development assessments for every player.
            </p>
          </div>
          
          {isStaff && (
            <Button onClick={() => setCreateOpen(true)} className="rounded-xl shrink-0 shadow-sm" size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Start Cycle
            </Button>
          )}
        </header>

        {cycles.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No development cycles yet"
            message="Start a new cycle to begin tracking and reviewing player development."
            action={isStaff ? <Button onClick={() => setCreateOpen(true)} className="mt-4 rounded-xl">Start Cycle</Button> : undefined}
          />
        ) : (
          <div className="space-y-8">
            {activeCycles.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" /> In Progress
                </h2>
                <div className="grid gap-3">
                  {activeCycles.map(cycle => (
                    <CycleCard key={cycle.id} cycle={cycle} teamId={teamId} />
                  ))}
                </div>
              </section>
            )}

            {pastCycles.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold uppercase tracking-wider text-muted-foreground">Past Cycles</h2>
                <div className="grid gap-3 opacity-90">
                  {pastCycles.map(cycle => (
                    <CycleCard key={cycle.id} cycle={cycle} teamId={teamId} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <StartCycleDialog 
        teamId={teamId} 
        open={createOpen} 
        onOpenChange={setCreateOpen} 
        onSuccess={(id) => setLocation(`/development/cycles/${id}`)}
      />
    </div>
  );
}

function CycleCard({ cycle, teamId }: { cycle: any, teamId: number }) {
  const isReleased = cycle.status === "released";
  const isSubmitted = cycle.status === "submitted";
  
  return (
    <Link href={`/development/cycles/${cycle.id}`} className="block group">
      <div className="bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all hover:border-primary/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h3 className="text-xl font-display font-bold group-hover:text-primary transition-colors truncate">
              {cycle.title}
            </h3>
            {isReleased && <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200"><Eye className="mr-1 h-3 w-3" /> Released</Badge>}
            {isSubmitted && <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200"><Lock className="mr-1 h-3 w-3" /> Locked</Badge>}
            {cycle.status === "active" && <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">Active</Badge>}
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {cycle.reportingPeriod}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">{cycle.completedPlayers}</span> of <span className="font-semibold text-foreground">{cycle.totalPlayers}</span> players reviewed
            </div>
            {cycle.status === "active" && (
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                <div 
                  className="h-full bg-primary transition-all duration-500" 
                  style={{ width: `${Math.round((cycle.completedPlayers / Math.max(cycle.totalPlayers, 1)) * 100)}%` }} 
                />
              </div>
            )}
            <div>
              Assessors: <span className="font-medium text-foreground">{cycle.assessors.map((a: any) => a.fullName).join(", ")}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
