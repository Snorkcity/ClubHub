const KEY = "nahreo.pendingTeamInvitation";

export function captureTeamInvitation() {
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname.endsWith("/join")) {
    const token = params.get("token");
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      sessionStorage.removeItem(CODE_KEY);
      sessionStorage.setItem(KEY, token);
    }
  }
  if (window.location.pathname.endsWith("/join-team")) {
    const code = params.get("code")?.trim();
    if (code && code.length <= 40) {
      sessionStorage.removeItem(KEY);
      sessionStorage.setItem(CODE_KEY, code);
    }
  }
}

const CODE_KEY = "nahreo.pendingTeamCode";

export function getPendingTeamCode(): string | null {
  return sessionStorage.getItem(CODE_KEY);
}

export function savePendingTeamCode(code: string) {
  const trimmed = code.trim();
  if (trimmed && trimmed.length <= 40) {
    sessionStorage.removeItem(KEY);
    sessionStorage.setItem(CODE_KEY, trimmed);
  } else sessionStorage.removeItem(CODE_KEY);
}

export function getTeamInvitationRedirect(): string | undefined {
  const token = sessionStorage.getItem(KEY);
  if (token) return `${import.meta.env.BASE_URL}join?token=${encodeURIComponent(token)}`;
  const code = getPendingTeamCode();
  if (code)
    return `${import.meta.env.BASE_URL}join-team?code=${encodeURIComponent(code)}`;
  return undefined;
}

export function clearPendingTeamCode() {
  sessionStorage.removeItem(CODE_KEY);
}

export function clearTeamInvitation() {
  sessionStorage.removeItem(KEY);
}
