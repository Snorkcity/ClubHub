let accountId: string | null = null;
const key = (id: string) => `nahreo.activeClub.${id}`;

export function bindClubAccount(id: string | null) { accountId = id; }
export function selectedClubId(): string | null {
  return accountId ? localStorage.getItem(key(accountId)) : null;
}
export function switchClub(clubId: number): void {
  if (!accountId || !Number.isSafeInteger(clubId) || clubId <= 0) return;
  localStorage.setItem(key(accountId), String(clubId));
  localStorage.removeItem("clubhub.activeTeamId");
  // Discard every old club query, team selection, dialog and mounted view.
  window.location.assign(`${import.meta.env.BASE_URL}home`);
}

window.addEventListener("storage", (event) => {
  if (accountId && event.key === key(accountId)) {
    localStorage.removeItem("clubhub.activeTeamId");
    window.location.assign(`${import.meta.env.BASE_URL}home`);
  }
});
