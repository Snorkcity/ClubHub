import { useState } from "react";
import { Link } from "wouter";
import { Search, UserSquare2, ShieldCheck, Mail, Phone, MapPin } from "lucide-react";
import { useListPeople, getListPeopleQueryKey } from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function PeopleList() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");

  const { data: people, isLoading, error, refetch } = useListPeople({
    search: search || undefined,
    role: role !== "all" ? role as any : undefined
  }, { 
    query: { queryKey: getListPeopleQueryKey({ search: search || undefined, role: role !== "all" ? role as any : undefined }) } 
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-6xl flex-1 flex flex-col h-full">
        <header className="mb-8 shrink-0">
          <h1 className="text-3xl font-display font-bold tracking-tight">Directory</h1>
          <p className="text-muted-foreground mt-1">Find members, players, and staff across the club.</p>
        </header>

        <div className="flex flex-col sm:flex-row gap-4 mb-6 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 rounded-xl border-border/60 bg-card shadow-sm text-base"
            />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full sm:w-[200px] h-12 rounded-xl border-border/60 bg-card shadow-sm text-base font-medium">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="player">Players</SelectItem>
              <SelectItem value="coach">Coaches</SelectItem>
              <SelectItem value="manager">Managers</SelectItem>
              <SelectItem value="parent">Parents</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto pb-8">
          {isLoading ? (
            <LoadingScreen message="Searching directory..." />
          ) : error || !people ? (
            <ErrorState onRetry={() => refetch()} />
          ) : people.length === 0 ? (
            <EmptyState 
              title="No people found" 
              message="Try adjusting your search or filters."
              icon={UserSquare2}
            />
          ) : (
            <div className="bg-card border rounded-3xl shadow-sm overflow-hidden flex flex-col divide-y">
              {people.map(person => (
                <Link key={person.id} href={`/people/${person.id}`}>
                  <div className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4 flex-1">
                      <Avatar className="h-14 w-14 border shadow-sm">
                        <AvatarImage src={person.avatarUrl || undefined} />
                        <AvatarFallback className="font-bold text-lg bg-primary/10 text-primary">
                          {person.firstName?.charAt(0)}{person.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors flex items-center gap-2">
                          {person.fullName}
                          {person.isMinor && <Badge variant="secondary" className="text-[10px] py-0 h-4">MINOR</Badge>}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          {person.email && (
                            <span className="flex items-center"><Mail className="h-3 w-3 mr-1.5 opacity-70" /> {person.email}</span>
                          )}
                          {person.phone && (
                            <span className="flex items-center"><Phone className="h-3 w-3 mr-1.5 opacity-70" /> {person.phone}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
