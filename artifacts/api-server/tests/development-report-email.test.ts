import { describe, expect, it } from "vitest";
import { developmentReportEmail } from "../src/lib/development-report-email";

const details = {
  playerName: "Player One",
  clubName: "Riverside FC",
  teamName: "U13 Rovers",
  reportingPeriod: "Mid-season 2027",
  link: "https://app.nahreo.com/development/reports/3",
};

describe("family report-ready email", () => {
  it("identifies the player, coaching club, team and reporting period", () => {
    const email = developmentReportEmail(details);
    expect(email.subject).toBe("Player One's feedback report — U13 Rovers");
    for (const value of Object.values(details)) {
      expect(email.text).toContain(value);
      expect(email.html).toContain(value);
    }
    expect(email.text).toContain("The coaching team at Riverside FC has released");
    expect(email.html).toContain("View report in Nahreo");
    expect(email.text).toContain("remain available in Nahreo");
  });

  it("escapes all dynamic values in HTML", () => {
    const email = developmentReportEmail({
      ...details, playerName: "<Player>", clubName: "Club & Co",
      teamName: '"Rovers"', reportingPeriod: "<script>bad</script>",
      link: 'https://app.nahreo.com/development/reports/3?x="&y=1',
    });
    expect(email.html).toContain("&lt;Player&gt;");
    expect(email.html).toContain("Club &amp; Co");
    expect(email.html).toContain("&quot;Rovers&quot;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("?x=&quot;&amp;y=1");
  });

  it("keeps assessment content out of email and supports dev report links", () => {
    const email = developmentReportEmail({
      ...details, link: "https://preview.replit.dev/development/reports/3",
    });
    expect(email.text).toContain("https://preview.replit.dev/development/reports/3");
    expect(email.html).not.toContain("app.nahreo.com");
    expect(email.text).toContain("Sign in");
    expect(email.html).not.toMatch(/DEV SAMPLE|score|technical competency/i);
  });
});
