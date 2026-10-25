const KEY = "nahreo.pendingTeamInvitation";

export function captureTeamInvitation() {
  if (!window.location.pathname.endsWith("/join")) return;
  const token = new URLSearchParams(window.location.search).get("token");
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token))
    sessionStorage.setItem(KEY, token);
}

export function getTeamInvitationRedirect(): string | undefined {
  const token = sessionStorage.getItem(KEY);
  return token ? `${import.meta.env.BASE_URL}join?token=${encodeURIComponent(token)}` : undefined;
}

export function clearTeamInvitation() {
  sessionStorage.removeItem(KEY);
}
