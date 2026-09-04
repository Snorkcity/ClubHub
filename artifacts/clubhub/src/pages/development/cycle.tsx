import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Check, Lock, Eye, HelpCircle, User, Loader2 } from "lucide-react";

import {
  useGetDevelopmentCycle,
  getGetDevelopmentCycleQueryKey,
  useSubmitDevelopmentCycle,
  useReleaseDevelopmentReports,
  type DevelopmentCycleDetail,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { WordingForm } from "@/components/development/wording-form";
import { TeamReportView } from "@/components/development/team-report-view";
import { AssessmentForm } from "@/components/development/assessment-form";

export default function DevelopmentCycle() {
  const params = useParams();
  const cycleId = Number(params.cycleId);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"wording" | "team" | "assessments" | null>(null);

  const { data: cycle, isLoading, error, refetch } = useGetDevelopmentCycle(cycleId, {
    query: { queryKey: getGetDevelopmentCycleQueryKey(cycleId) }
  });

  // Select first player by default if none selected
  useEffect(() => {
    if (cycle && !selectedPlayerId && cycle.players.length > 0) {
      setSelectedPlayerId(cycle.players[0].person.id);
    }
  }, [cycle, selectedPlayerId]);

  useEffect(() => {
    if (cycle && cycle.status !== "active" && !activeTab) {
      setActiveTab(cycle.capabilities.canReviewReports ? "wording" : "team");
    }
  }, [cycle, activeTab]);

  if (isLoading) return <LoadingScreen message="Loading cycle workspace..." />;
  if (error || !cycle) return <ErrorState onRetry={() => refetch()} />;

  const selectedPlayer = cycle.players.find(p => p.person.id === selectedPlayerId) || null;
  const isLocked = cycle.status !== "active";
  const renderSidebar = !isLocked || activeTab === "wording" || activeTab === "assessments";

  return (
    <div className="flex-1 flex flex-col h-screen md:h-auto md:min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b bg-card flex flex-col z-10 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
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
        </div>
        {isLocked && activeTab && (
          <div className="px-4 bg-muted/5 border-t">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="h-12 w-full justify-start rounded-none border-b bg-transparent p-0 overflow-x-auto overflow-y-hidden no-scrollbar">
                {cycle.capabilities.canReviewReports && (
                  <TabsTrigger
                    value="wording"
                    className="rounded-none border-b-2 border-transparent px-4 py-3 font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                  >
                    Family Wording
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="team"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                >
                  Team Report
                </TabsTrigger>
                <TabsTrigger
                  value="assessments"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                >
                  Assessments
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Player List (Sidebar) */}
        {renderSidebar && (
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
                const isComplete = activeTab === "wording" ? !!player.reportDraft?.reviewedAt : player.complete;
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
                      {isComplete && (
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
                        {activeTab === "wording"
                          ? (isComplete ? "Reviewed" : "Needs review")
                          : (isComplete ? "Assessed" : "Needs assessment")
                        }
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        )}

        {/* Assessment Area */}
        <div className={`flex-1 flex flex-col min-w-0 bg-background ${renderSidebar && !selectedPlayerId && 'hidden md:flex'}`}>
          {activeTab === "team" ? (
            <TeamReportView cycle={cycle} />
          ) : activeTab === "wording" && selectedPlayer ? (
            <WordingForm cycle={cycle} player={selectedPlayer} onBack={() => setSelectedPlayerId(null)} />
          ) : selectedPlayer ? (
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
  const allReviewed = cycle.reviewedReports === cycle.totalReports;
  const remainingReviews = cycle.totalReports - cycle.reviewedReports;

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
      },
      onError: (err: any) => {
        toast({
          title: "Cannot release reports",
          description: err.message || "Please ensure all reports are reviewed and saved before releasing.",
          variant: "destructive"
        });
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
        <Button
          onClick={() => setReleaseOpen(true)}
          variant={allReviewed ? "default" : "secondary"}
          className={!allReviewed ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : ""}
        >
          <Eye className="mr-2 h-4 w-4" />
          {allReviewed ? "Release Reports" : `${remainingReviews} left to review`}
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
              {!allReviewed && `Wait! You still have ${remainingReviews} report(s) left to review. You cannot release until all drafts are reviewed.`}
              {allReviewed && "This will make the reports visible on player profiles for guardians and the players themselves. They will receive a notification."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseOpen(false)}>Cancel</Button>
            <Button variant="default" onClick={handleRelease} disabled={releaseReports.isPending || !allReviewed}>
              {releaseReports.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release {cycle.completedPlayers} reports
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
