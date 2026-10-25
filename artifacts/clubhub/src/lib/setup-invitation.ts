const KEY = "nahreo.pendingClubInvitation";
export function captureSetupInvitation() {
  const invitation = new URLSearchParams(window.location.search).get("invitation");
  if (invitation && /^[a-f0-9]{64}$/.test(invitation))
    sessionStorage.setItem(KEY, invitation);
}
export function getSetupInvitation(): string | undefined {
  return sessionStorage.getItem(KEY) ?? undefined;
}
export function clearSetupInvitation() { sessionStorage.removeItem(KEY); }
