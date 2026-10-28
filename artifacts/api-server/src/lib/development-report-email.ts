type ReportEmailInput = {
  playerName: string;
  clubName: string;
  teamName: string;
  reportingPeriod: string;
  link: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

export function developmentReportEmail(input: ReportEmailInput) {
  const { playerName, clubName, teamName, reportingPeriod, link } = input;
  return {
    subject: `${playerName}'s feedback report — ${teamName}`,
    text: [
      "Player feedback report ready",
      `The coaching team at ${clubName} has released a player feedback report for ${playerName}, with ${teamName}, covering ${reportingPeriod}.`,
      "The report is available in the Nahreo app. Sign in to read the feedback, including strengths and areas for development.",
      `View report in Nahreo: ${link}`,
      "The report will remain available in Nahreo for you to refer back to.",
    ].join("\n\n"),
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#101828;max-width:560px;margin:auto">
<h1 style="color:#173F8A">Player feedback report ready</h1>
<p>The coaching team at <strong>${escapeHtml(clubName)}</strong> has released a player feedback report for <strong>${escapeHtml(playerName)}</strong>, with <strong>${escapeHtml(teamName)}</strong>, covering <strong>${escapeHtml(reportingPeriod)}</strong>.</p>
<p>The report is available in the Nahreo app. Sign in to read the feedback, including strengths and areas for development.</p>
<p style="margin:32px 0"><a href="${escapeHtml(link)}" style="background:#173F8A;color:white;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700">View report in Nahreo</a></p>
<p>The report will remain available in Nahreo for you to refer back to.</p>
</div>`,
  };
}
