import assert from "node:assert/strict";
import test from "node:test";
import { attendanceGroups } from "../src/lib/attendance-groups";

test("responses are grouped by status, then coaches before players, alphabetically", () => {
  const groups = attendanceGroups([
    { status: "out", role: "player", person: { fullName: "Zoe" } },
    { status: "going", role: "player", person: { fullName: "Ben" } },
    { status: "going", role: "manager", person: { fullName: "Nic" } },
    { status: "out", role: "coach", person: { fullName: "Scott" } },
    { status: "going", role: "coach", person: { fullName: "Alex" } },
    { status: "going", role: "player", person: { fullName: "Amy" } },
    { status: "maybe", role: "player", person: { fullName: "Conor" } },
  ]);
  assert.deepEqual(groups.map((g) => g.title), ["Going", "Not going", "Maybe"]);
  assert.deepEqual(groups[0].coaches.map((r) => r.person.fullName), ["Alex", "Nic"]);
  assert.deepEqual(groups[0].players.map((r) => r.person.fullName), ["Amy", "Ben"]);
  assert.equal(groups[1].coaches[0].person.fullName, "Scott");
  assert.equal(groups[1].players[0].person.fullName, "Zoe");
  assert.equal(groups[2].players[0].person.fullName, "Conor");
  assert.equal(groups.flatMap((g) => [...g.coaches, ...g.players]).length, 7);
});

test("empty responses leave every group empty", () => {
  assert.ok(attendanceGroups([]).every((g) => !g.coaches.length && !g.players.length));
});
