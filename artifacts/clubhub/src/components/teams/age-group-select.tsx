import { normalizeTeamAgeGroup, teamFeatures, TEAM_AGE_GROUP_OPTIONS } from "@workspace/api-client-react";

export function AgeGroupSelect({
  value, onChange, id, disabled,
}: {
  value: string; onChange: (value: string) => void; id?: string; disabled?: boolean;
}) {
  const features = teamFeatures(value);
  const normalized = normalizeTeamAgeGroup(value);
  const options = normalized && !TEAM_AGE_GROUP_OPTIONS.includes(normalized)
    ? [normalized, ...TEAM_AGE_GROUP_OPTIONS] : TEAM_AGE_GROUP_OPTIONS;
  return (
    <div className="space-y-2">
      <select
        id={id}
        aria-label="Age group"
        value={normalized ?? value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-base disabled:opacity-50"
      >
        <option value="">Choose an age group</option>
        {value && !normalized && <option value={value}>Unclassified: {value}</option>}
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      {features.classified && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {features.monitoring
            ? "RPE, wellness and player learning preferences included."
            : "RPE, wellness and player learning preferences are not included below U14."}
          {" "}{features.timekeeping
            ? "Junior match timekeeping included."
            : "Junior match timekeeping is not included from U18."}
        </p>
      )}
    </div>
  );
}
