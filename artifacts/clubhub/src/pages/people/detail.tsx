import { useParams, Link } from "wouter";
import { Mail, Phone, ShieldCheck, Users, ArrowLeft, CalendarDays } from "lucide-react";
import { useGetPerson, getGetPersonQueryKey, useGetMe } from "@workspace/api-client-react";
import { format } from "date-fns";

import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkGuardianDialog, RemoveGuardianButton } from "@/components/admin/family-admin";

export default function PersonDetail() {
  const params = useParams();
  const personId = Number(params.personId);

  const { data, isLoading, error, refetch } = useGetPerson(personId, {
    query: { enabled: !!personId, queryKey: getGetPersonQueryKey(personId) }
  });
  const { data: me } = useGetMe();

  if (isLoading) return <LoadingScreen message="Loading profile..." />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;

  const { person, memberships, guardians, wards } = data;
  const isAdmin = !!me?.isClubAdmin;
  const guardianIds = guardians.map((g) => g.guardian.id);
  const wardIds = wards.map((w) => w.player.id);

  return (
    <div className="flex-1 overflow-y-auto bg-muted/5">
      {/* Cover Profile */}
      <div className="h-32 md:h-48 w-full bg-gradient-to-r from-primary to-primary/80 shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
      </div>
      
      <div className="container mx-auto px-4 md:px-8 pb-12 lg:max-w-4xl -mt-16 md:-mt-20">
        <Link href="/people" className="inline-flex items-center text-sm font-bold text-white/80 hover:text-white mb-6 relative z-10 transition-colors drop-shadow-md">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Directory
        </Link>
        
        <div className="bg-card border rounded-3xl p-6 shadow-sm mb-8 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <Avatar className="h-24 w-24 md:h-32 md:w-32 rounded-3xl border-4 border-card shadow-md z-10 -mt-12 md:-mt-16 bg-card">
              <AvatarImage src={person.avatarUrl || undefined} />
              <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">
                {person.firstName?.charAt(0)}{person.lastName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0 w-full pt-2">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight truncate">
                  {person.fullName}
                </h1>
                {person.isMinor && <Badge variant="secondary" className="font-semibold bg-amber-100 text-amber-800 hover:bg-amber-100 border-transparent">Minor</Badge>}
              </div>
              
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium">
                {person.email && (
                  <span className="flex items-center"><Mail className="h-4 w-4 mr-2 opacity-70" /> {person.email}</span>
                )}
                {person.phone && (
                  <span className="flex items-center"><Phone className="h-4 w-4 mr-2 opacity-70" /> {person.phone}</span>
                )}
                {person.dateOfBirth && (
                  <span className="flex items-center"><CalendarDays className="h-4 w-4 mr-2 opacity-70" /> Born {format(new Date(person.dateOfBirth), "MMM d, yyyy")}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            {/* Teams */}
            <div className="space-y-4">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Teams
              </h2>
              {memberships.length === 0 ? (
                <Card className="p-6 text-center border-dashed bg-muted/20 rounded-2xl">
                  <p className="text-muted-foreground text-sm">Not assigned to any teams.</p>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {memberships.map((membership) => (
                    <Link key={membership.id} href={`/teams/${membership.teamId}`}>
                      <Card className="p-4 rounded-2xl flex items-center justify-between hover:shadow-md transition-shadow group border-transparent hover:border-border cursor-pointer">
                        <div className="flex flex-col">
                          <span className="font-bold text-lg group-hover:text-primary transition-colors">{membership.teamName}</span>
                          <span className="text-sm font-semibold text-muted-foreground capitalize">{membership.role}</span>
                        </div>
                        {(membership.jerseyNumber || membership.position) && (
                          <div className="text-right">
                            {membership.jerseyNumber && <div className="font-bold font-mono text-primary text-xl leading-none mb-1">#{membership.jerseyNumber}</div>}
                            {membership.position && <div className="text-xs font-semibold text-muted-foreground uppercase">{membership.position}</div>}
                          </div>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {/* Family (Guardians/Wards) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-display font-bold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Family
                </h2>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <LinkGuardianDialog personId={personId} direction="addGuardian" excludeIds={guardianIds} />
                    <LinkGuardianDialog personId={personId} direction="addPlayer" excludeIds={wardIds} />
                  </div>
                )}
              </div>
              
              {guardians.length === 0 && wards.length === 0 ? (
                <Card className="p-6 text-center border-dashed bg-muted/20 rounded-2xl">
                  <p className="text-muted-foreground text-sm">
                    No family members linked.{isAdmin ? " Use the buttons above to link a guardian or player." : ""}
                  </p>
                </Card>
              ) : (
                <Card className="rounded-3xl border shadow-sm overflow-hidden flex flex-col divide-y">
                  {guardians.length > 0 && (
                    <div className="p-4 bg-muted/30">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Guardians</h3>
                      <div className="space-y-3">
                        {guardians.map(g => (
                          <div key={g.id} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-background transition-colors">
                            <Link href={`/people/${g.guardian.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                              <Avatar className="h-10 w-10 border shadow-sm">
                                <AvatarImage src={g.guardian.avatarUrl || undefined} />
                                <AvatarFallback>{g.guardian.firstName?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-sm truncate">{g.guardian.fullName}</span>
                                <span className="text-xs text-muted-foreground capitalize">{g.relationship}</span>
                              </div>
                            </Link>
                            {isAdmin && (
                              <RemoveGuardianButton guardianshipId={g.id} personId={personId} otherId={g.guardian.id} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {wards.length > 0 && (
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Linked Players</h3>
                      <div className="space-y-3">
                        {wards.map(w => (
                          <div key={w.id} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-muted transition-colors">
                            <Link href={`/people/${w.player.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                              <Avatar className="h-10 w-10 border shadow-sm">
                                <AvatarImage src={w.player.avatarUrl || undefined} />
                                <AvatarFallback>{w.player.firstName?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-sm truncate">{w.player.fullName}</span>
                                <span className="text-xs text-muted-foreground capitalize">{w.relationship}</span>
                              </div>
                            </Link>
                            {isAdmin && (
                              <RemoveGuardianButton guardianshipId={w.id} personId={personId} otherId={w.player.id} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
