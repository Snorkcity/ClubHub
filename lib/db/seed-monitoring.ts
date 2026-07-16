/**
 * Seed Wellness/RPE test data for two teams (U13 Rovers #4 and U13 Falcons #5).
 * - Past training/game events over the last 5 weeks (Tue/Thu training, Sat game)
 * - RPE entries for most players for most sessions
 * - Daily wellness entries (~80% completion) with per-player baselines
 * - Two "story" players: player1@ (red) has a load spike + fading wellness this
 *   week (should flag ALERT); player2@ (blue) is mildly below norm (WATCH).
 *
 * Idempotent: skips events/entries that already exist.
 * Run: esbuild-bundle to lib/db/.tmp.seed.mjs and node it from lib/db (see repo quirks).
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  db,
  eventsTable,
  teamMembersTable,
  usersTable,
  rpeEntriesTable,
  wellnessEntriesTable,
} from "./src/index";

const TEAMS = [4, 5];
const DAYS_BACK = 35;
const TZ_OFFSET_HOURS = 10; // Australia/Canberra (AEST)

// Deterministic PRNG so reruns look the same.
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function localDate(daysAgo: number): Date {
  // Midday local time on that day, as a stable anchor.
  const now = new Date();
  const d = new Date(now.getTime() - daysAgo * 86400000);
  return d;
}
function dateStrLocal(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_HOURS * 3600000);
  return shifted.toISOString().slice(0, 10);
}
function atLocalTime(d: Date, hour: number, minute: number): Date {
  const shifted = new Date(d.getTime() + TZ_OFFSET_HOURS * 3600000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  return new Date(Date.UTC(y, m, day, hour - TZ_OFFSET_HOURS, minute));
}

async function main() {
  // Rosters
  const roster = await db
    .select({ tm: teamMembersTable, u: usersTable })
    .from(teamMembersTable)
    .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(inArray(teamMembersTable.teamId, TEAMS));

  const playersByTeam = new Map<number, { id: number; email: string | null; name: string }[]>();
  const managerByTeam = new Map<number, number>();
  for (const { tm, u } of roster) {
    if (tm.role === "player") {
      const list = playersByTeam.get(tm.teamId) ?? [];
      list.push({ id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}` });
      playersByTeam.set(tm.teamId, list);
    } else if (!managerByTeam.has(tm.teamId)) {
      managerByTeam.set(tm.teamId, u.id);
    }
  }
  for (const t of TEAMS) {
    console.log(`Team ${t}: ${playersByTeam.get(t)?.length ?? 0} players, staff creator ${managerByTeam.get(t) ?? "none"}`);
  }

  // ---- 1. Past events (Tue/Thu training 17:30–19:00, Sat game 09:00–10:40) ----
  const existing = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        inArray(eventsTable.teamId, TEAMS),
        gte(eventsTable.startsAt, localDate(DAYS_BACK)),
        lte(eventsTable.startsAt, new Date()),
      ),
    );
  const existingKeys = new Set(
    existing.map((e) => `${e.teamId}:${e.type}:${dateStrLocal(e.startsAt)}`),
  );

  const newEvents: (typeof eventsTable.$inferInsert)[] = [];
  for (let ago = DAYS_BACK; ago >= 0; ago--) {
    const day = localDate(ago);
    const dow = new Date(day.getTime() + TZ_OFFSET_HOURS * 3600000).getUTCDay();
    for (const teamId of TEAMS) {
      const createdById = managerByTeam.get(teamId) ?? 160;
      let type: "training" | "game" | null = null;
      let startsAt: Date | null = null;
      let endsAt: Date | null = null;
      let title = "";
      if (dow === 2 || dow === 4) {
        type = "training";
        startsAt = atLocalTime(day, 17, 30);
        endsAt = atLocalTime(day, 19, 0);
        title = "Team training";
      } else if (dow === 6) {
        type = "game";
        startsAt = atLocalTime(day, 9, 0);
        endsAt = atLocalTime(day, 10, 40);
        title = teamId === 4 ? "League match" : "League fixture";
      }
      if (!type || !startsAt || startsAt > new Date()) continue;
      const key = `${teamId}:${type}:${dateStrLocal(startsAt)}`;
      if (existingKeys.has(key)) continue;
      newEvents.push({
        teamId,
        createdById,
        type,
        title,
        location: type === "game" ? "Riverside Park, Pitch 2" : "Riverside Park, Pitch 5",
        startsAt,
        endsAt,
      });
    }
  }
  if (newEvents.length) await db.insert(eventsTable).values(newEvents);
  console.log(`Inserted ${newEvents.length} past events (${existing.length} already existed)`);

  const allEvents = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        inArray(eventsTable.teamId, TEAMS),
        inArray(eventsTable.type, ["training", "game"]),
        gte(eventsTable.startsAt, localDate(DAYS_BACK)),
        lte(eventsTable.startsAt, new Date()),
      ),
    );

  // ---- 2. Player profiles ----
  type Profile = {
    id: number;
    teamId: number;
    baseWellness: number; // 3..4.5 typical
    baseRpe: number; // typical training RPE
    compliance: number; // chance of filling in
    story?: "red-flag" | "blue-watch";
  };
  const profiles: Profile[] = [];
  for (const teamId of TEAMS) {
    for (const p of playersByTeam.get(teamId) ?? []) {
      const story =
        p.email?.startsWith("player1@") ? "red-flag"
        : p.email?.startsWith("player2@") ? "blue-watch"
        : undefined;
      profiles.push({
        id: p.id,
        teamId,
        baseWellness: 3.2 + rand() * 1.2,
        baseRpe: 4 + rand() * 2.5,
        compliance: 0.65 + rand() * 0.3,
        story,
      });
      if (story) console.log(`Story player (${story}): ${p.name} [${p.id}]`);
    }
  }
  const playerIds = profiles.map((p) => p.id);

  // ---- 3. RPE entries ----
  const existingRpe = await db
    .select()
    .from(rpeEntriesTable)
    .where(inArray(rpeEntriesTable.userId, playerIds));
  const rpeKeys = new Set(existingRpe.map((r) => `${r.eventId}:${r.userId}`));
  const rpeRows: (typeof rpeEntriesTable.$inferInsert)[] = [];
  const now = Date.now();
  for (const ev of allEvents) {
    const finished = ev.endsAt ?? new Date(ev.startsAt.getTime() + 90 * 60000);
    if (finished.getTime() > now) continue;
    const daysAgoEv = (now - ev.startsAt.getTime()) / 86400000;
    const evMinutes = ev.endsAt
      ? Math.round((ev.endsAt.getTime() - ev.startsAt.getTime()) / 60000)
      : 90;
    for (const p of profiles) {
      if (p.teamId !== ev.teamId) continue;
      if (rpeKeys.has(`${ev.id}:${p.id}`)) continue;
      // leave the most recent session partly un-answered so "pending RPE" shows
      const answerChance = daysAgoEv < 1 ? 0.5 : 0.88;
      if (rand() > answerChance) continue;
      let rpe = p.baseRpe + (ev.type === "game" ? 2 : 0) + (rand() * 2 - 1);
      let minutes = ev.type === "game" ? randInt(45, evMinutes) : evMinutes;
      if (p.story === "red-flag" && daysAgoEv <= 7) {
        rpe += 3; // big spike this week
        minutes = evMinutes;
      }
      if (p.story === "blue-watch" && daysAgoEv <= 7) rpe += 1.2;
      rpeRows.push({
        eventId: ev.id,
        userId: p.id,
        rpe: clamp(rpe, 1, 10),
        minutes,
        submittedById: p.id,
      });
    }
  }
  if (rpeRows.length) await db.insert(rpeEntriesTable).values(rpeRows).onConflictDoNothing();
  console.log(`Inserted ${rpeRows.length} RPE entries`);

  // ---- 4. Wellness entries ----
  const existingWellness = await db
    .select()
    .from(wellnessEntriesTable)
    .where(inArray(wellnessEntriesTable.userId, playerIds));
  const wKeys = new Set(existingWellness.map((w) => `${w.userId}:${w.entryDate}`));
  const wRows: (typeof wellnessEntriesTable.$inferInsert)[] = [];
  for (let ago = DAYS_BACK; ago >= 0; ago--) {
    const dStr = dateStrLocal(localDate(ago));
    for (const p of profiles) {
      if (wKeys.has(`${p.id}:${dStr}`)) continue;
      if (rand() > p.compliance) continue;
      let base = p.baseWellness;
      if (p.story === "red-flag" && ago <= 6) base -= 0.4 * (7 - ago); // slide hard this week
      if (p.story === "blue-watch" && ago <= 6) base -= 0.8;
      const q = () => clamp(base + (rand() * 1.6 - 0.8), 1, 5);
      wRows.push({
        userId: p.id,
        entryDate: dStr,
        sleepQuality: q(),
        energy: q(),
        soreness: p.story === "red-flag" && ago <= 4 ? clamp(base - 0.8, 1, 5) : q(),
        stress: q(),
        mood: q(),
        submittedById: p.id,
      });
    }
  }
  if (wRows.length) await db.insert(wellnessEntriesTable).values(wRows).onConflictDoNothing();
  console.log(`Inserted ${wRows.length} wellness entries`);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
