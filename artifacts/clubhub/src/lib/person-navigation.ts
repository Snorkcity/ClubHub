export function monitoringProfileHref(personId: number, teamId: number) {
  return `/people/${personId}?fromMonitoring=${teamId}`;
}

export function personBackLink(search: string) {
  const teamId = new URLSearchParams(search).get("fromMonitoring");
  if (teamId && /^[1-9]\d*$/.test(teamId) && Number.isSafeInteger(Number(teamId))) {
    return { href: `/teams/${teamId}/monitoring`, label: "Back to Monitoring" };
  }
  return { href: "/people", label: "Back to Directory" };
}
