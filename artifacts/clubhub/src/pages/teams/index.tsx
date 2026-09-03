import { useState } from "react";
import { Link } from "wouter";
import { Users, Plus, Shield, ShieldCheck, ChevronRight } from "lucide-react";
import { 
  useListTeams, useGetMe, useCreateTeam, 
  getListTeamsQueryKey, getGetMeQueryKey,
  useGetClub, getGetClubQueryKey,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, DialogContent, DialogDescription, 
  DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, usesColour } from "@/lib/localisation";

export default function TeamsList() {
  const { data: me, isLoading: meLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: club } = useGetClub({ query: { queryKey: getGetClubQueryKey() } });
  const { data: teams, isLoading: teamsLoading, error, refetch } = useListTeams({ 
    query: { queryKey: getListTeamsQueryKey() } 
  });

  if (meLoading || teamsLoading) return <LoadingScreen message="Loading teams..." />;
  if (error || !teams || !me) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-6xl">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Teams</h1>
            <p className="text-muted-foreground mt-1">
              {me.isClubAdmin ? "Manage all teams in the club." : "The teams you are assigned to."}
            </p>
          </div>
          
          {me.isClubAdmin && (
            <CreateTeamDialog
              firstTeam={teams.length === 0}
              countryCode={club?.countryCode ?? "AU"}
            />
          )}
        </header>

        {teams.length === 0 ? (
          <EmptyState 
            title="No teams found" 
            message={me.isClubAdmin ? "Get started by creating your first team." : "You have not been assigned to any teams yet."}
            icon={Users}
            action={
              me.isClubAdmin
                ? <CreateTeamDialog openDefault firstTeam countryCode={club?.countryCode ?? "AU"} />
                : undefined
            }
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} me={me} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ team, me }: { team: any, me: any }) {
  // Find my role in this team if any
  const membership = me.memberships.find((m: any) => m.teamId === team.id);

  return (
    <Link href={`/teams/${team.id}`}>
      <Card className="group h-full flex flex-col p-6 rounded-3xl hover:shadow-md transition-all cursor-pointer border-transparent hover:border-border/80 relative overflow-hidden">
        <div 
          className="absolute top-0 left-0 w-full h-2" 
          style={{ backgroundColor: team.colorHex || "hsl(var(--primary))" }}
        />
        
        <div className="flex items-start justify-between mb-6">
          <div 
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-sm"
            style={{ backgroundColor: team.colorHex || "hsl(var(--primary))" }}
          >
            {team.name.charAt(0)}
          </div>
          {membership && (
            <Badge variant="secondary" className="font-semibold bg-muted/50">
              {membership.role === 'manager' && <ShieldCheck className="h-3 w-3 mr-1 text-primary" />}
              {membership.role === 'coach' && <Shield className="h-3 w-3 mr-1 text-amber-500" />}
              {membership.role === 'player' && <Users className="h-3 w-3 mr-1 text-blue-500" />}
              <span className="capitalize">{membership.role}</span>
            </Badge>
          )}
        </div>
        
        <div className="flex-1">
          <h3 className="text-xl font-display font-bold group-hover:text-primary transition-colors line-clamp-1">{team.name}</h3>
          <p className="text-sm font-medium text-muted-foreground mt-1">{team.ageGroup} {team.gender ? `• ${team.gender}` : ''}</p>
        </div>
        
        <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground pt-4 border-t border-border/40">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5 font-medium"><Users className="h-4 w-4" /> {team.playerCount} Players</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

const teamFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  ageGroup: z.string().min(1, "Age group is required."),
  gender: z.string().optional(),
  colorHex: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i, "Must be a valid hex color code (e.g. #FF0000)").optional().or(z.literal("")),
  countryCode: z.enum(["AU", "NZ", "GB", "US", "CA"]),
});

function CreateTeamDialog({
  openDefault = false,
  firstTeam = false,
  countryCode = "AU",
}: {
  openDefault?: boolean;
  firstTeam?: boolean;
  countryCode?: string;
}) {
  const [open, setOpen] = useState(openDefault);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof teamFormSchema>>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      ageGroup: "U12",
      gender: "",
      colorHex: "#16A34A",
      countryCode: countryCode as "AU",
    },
  });

  const createTeam = useCreateTeam();
  const selectedCountry = firstTeam ? form.watch("countryCode") : countryCode;

  function onSubmit(values: z.infer<typeof teamFormSchema>) {
    createTeam.mutate({
      data: {
        name: values.name,
        ageGroup: values.ageGroup,
        gender: values.gender || undefined,
        colorHex: values.colorHex || undefined,
        countryCode: firstTeam ? values.countryCode : undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }); // Refresh memberships if any
        setOpen(false);
        form.reset();
        toast({ title: "Team created successfully" });
      },
      onError: () => {
        toast({ 
          title: "Failed to create team", 
          description: "An unexpected error occurred.",
          variant: "destructive" 
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full font-bold px-6 shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> New Team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Create New Team</DialogTitle>
          <DialogDescription>
            Add a new team to the club. You can assign players and staff later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            {firstTeam && (
              <FormField
                control={form.control}
                name="countryCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Choose a country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Falcons, Select Red, etc." className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ageGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age Group</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. U12, Varsity" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Boys, Girls, Coed" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="colorHex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Team {usesColour(selectedCountry) ? "Colour" : "Color"} (Hex)
                  </FormLabel>
                  <div className="flex gap-3">
                    <div 
                      className="h-10 w-10 rounded-xl border shrink-0" 
                      style={{ backgroundColor: field.value || "#16A34A" }} 
                    />
                    <FormControl>
                      <Input placeholder="#16A34A" className="rounded-xl flex-1" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="pt-4 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="mr-2 rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={createTeam.isPending} className="rounded-xl font-bold px-6">
                {createTeam.isPending ? "Creating..." : "Create Team"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
