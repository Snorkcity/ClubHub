import { useEffect, useState } from "react";
import { useUpdateTeam, normalizeTeamAgeGroup } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AgeGroupSelect } from "./age-group-select";
import { Button } from "@/components/ui/button";

export function AgeGroupSettings({ teamId, ageGroup }: { teamId: number; ageGroup: string }) {
  const [value, setValue] = useState(ageGroup);
  const queryClient = useQueryClient();
  const update = useUpdateTeam();
  useEffect(() => { setValue(ageGroup); }, [teamId, ageGroup]);
  return <section className="mb-6 space-y-3 rounded-2xl border bg-card p-4" aria-label="Team age group and features">
    <h2 className="font-semibold">Team age group and features</h2>
    <AgeGroupSelect value={value} onChange={setValue} disabled={update.isPending} />
    <p className="text-xs text-muted-foreground">Changing the age group updates available tools. Existing records are preserved. Coaches keep their own private learning questionnaire.</p>
    {update.isError && <p role="alert" className="text-sm text-destructive">The age group could not be saved. Please try again.</p>}
    <Button
      disabled={!normalizeTeamAgeGroup(value) || value === ageGroup || update.isPending}
      onClick={() => update.mutate({ teamId, data: { ageGroup: value } }, {
        onSuccess: () => queryClient.invalidateQueries({
          predicate: query => /^\/api\/(teams|me|monitoring|people|events)(\/|$)/.test(String(query.queryKey[0])),
        }),
      })}
    >{update.isPending ? "Saving..." : "Save age group"}</Button>
  </section>;
}
