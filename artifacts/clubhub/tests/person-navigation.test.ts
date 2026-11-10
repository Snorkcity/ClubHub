import assert from "node:assert/strict";
import { test } from "node:test";
import { monitoringProfileHref, personBackLink } from "../src/lib/person-navigation";

test("monitoring profile links return to the originating team", () => {
  for (const teamId of [1, 42, 109]) {
    const href = monitoringProfileHref(17, teamId);
    assert.equal(href, `/people/17?fromMonitoring=${teamId}`);
    assert.deepEqual(personBackLink(href.split("?")[1]), {
      href: `/teams/${teamId}/monitoring`, label: "Back to Monitoring",
    });
  }
});

test("ordinary directory and direct profile links retain their directory return", () => {
  for (const search of ["", "?tab=reports", "?fromMonitoring="]) {
    assert.deepEqual(personBackLink(search), { href: "/people", label: "Back to Directory" });
  }
});

test("malformed origin parameters cannot redirect outside the allowed monitoring route", () => {
  for (const value of ["0", "-1", "1.5", "Infinity", "9007199254740992", "//example.com", "/teams/1/monitoring", "1/../2"]) {
    assert.deepEqual(personBackLink(`fromMonitoring=${encodeURIComponent(value)}`), {
      href: "/people", label: "Back to Directory",
    });
  }
});
