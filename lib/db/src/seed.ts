import { db, pool } from "./index";
import {
  clubsTable,
  seasonsTable,
  usersTable,
  teamsTable,
  teamMembersTable,
  guardianshipsTable,
  postsTable,
  commentsTable,
  eventsTable,
  rsvpsTable,
  chatsTable,
  chatMembersTable,
  messagesTable,
} from "./schema";

const FIRST = [
  "Liam", "Noah", "Ava", "Mia", "Ethan", "Sofia", "Lucas", "Emma", "Mason",
  "Olivia", "Leo", "Isla", "Kai", "Zoe", "Finn", "Nora", "Diego", "Amara",
  "Jax", "Lena", "Theo", "Ruby", "Omar", "Elsa", "Cole", "Maya", "Reid",
  "Ivy", "Hugo", "Nina", "Sam", "Aria", "Ben", "Cleo", "Tara", "Milo",
];
const LAST = [
  "Carter", "Nguyen", "Rossi", "Okafor", "Silva", "Kim", "Patel", "Brooks",
  "Torres", "Haddad", "Novak", "Reyes", "Walsh", "Ivanov", "Diallo", "Costa",
  "Bauer", "Flores", "Sato", "Mendez",
];
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

const pick = <T>(arr: T[], i: number) => arr[i % arr.length];
const rand = (n: number) => Math.floor(Math.random() * n);

function dobForAge(age: number): string {
  const now = new Date();
  const year = now.getFullYear() - age;
  const month = 1 + rand(12);
  const day = 1 + rand(27);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysFromNow(days: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const TEAMS = [
  { name: "Riverside U9 Lions", ageGroup: "U9", gender: "Mixed", colorHex: "#16a34a", age: 8 },
  { name: "Riverside U11 Hawks", ageGroup: "U11", gender: "Boys", colorHex: "#2563eb", age: 10 },
  { name: "Riverside U11 Comets", ageGroup: "U11", gender: "Girls", colorHex: "#db2777", age: 10 },
  { name: "Riverside U13 Rovers", ageGroup: "U13", gender: "Boys", colorHex: "#ea580c", age: 12 },
  { name: "Riverside U13 Falcons", ageGroup: "U13", gender: "Girls", colorHex: "#7c3aed", age: 12 },
  { name: "Riverside U15 United", ageGroup: "U15", gender: "Boys", colorHex: "#0891b2", age: 14 },
  { name: "Riverside U15 Storm", ageGroup: "U15", gender: "Girls", colorHex: "#ca8a04", age: 14 },
  { name: "Riverside U18 Athletic", ageGroup: "U18", gender: "Boys", colorHex: "#dc2626", age: 17 },
];

let nameCursor = 0;
function nextName() {
  const first = pick(FIRST, nameCursor);
  const last = pick(LAST, Math.floor(nameCursor / FIRST.length) + nameCursor);
  nameCursor++;
  return { first, last };
}

async function main() {
  const existing = await db.select().from(clubsTable).limit(1);
  if (existing.length > 0) {
    console.log("Club already seeded — skipping.");
    await pool.end();
    return;
  }

  const [club] = await db
    .insert(clubsTable)
    .values({
      name: "Riverside FC",
      primaryColor: "#16a34a",
    })
    .returning();

  const [activeSeason] = await db
    .insert(seasonsTable)
    .values({
      clubId: club.id,
      name: "2025/26 Season",
      startDate: "2025-09-01",
      endDate: "2026-06-30",
      isActive: true,
    })
    .returning();

  await db.insert(seasonsTable).values({
    clubId: club.id,
    name: "2024/25 Season",
    startDate: "2024-09-01",
    endDate: "2025-06-30",
    isActive: false,
  });

  for (const t of TEAMS) {
    const [team] = await db
      .insert(teamsTable)
      .values({
        clubId: club.id,
        seasonId: activeSeason.id,
        name: t.name,
        ageGroup: t.ageGroup,
        gender: t.gender,
        colorHex: t.colorHex,
      })
      .returning();

    // Coach + manager
    const coachName = nextName();
    const [coach] = await db
      .insert(usersTable)
      .values({
        clubId: club.id,
        firstName: coachName.first,
        lastName: coachName.last,
        email: `${coachName.first}.${coachName.last}@riversidefc.example`.toLowerCase(),
        phone: `555-01${String(rand(90) + 10)}`,
      })
      .returning();
    await db.insert(teamMembersTable).values({
      teamId: team.id,
      userId: coach.id,
      role: "coach",
    });

    const mgrName = nextName();
    const [manager] = await db
      .insert(usersTable)
      .values({
        clubId: club.id,
        firstName: mgrName.first,
        lastName: mgrName.last,
        email: `${mgrName.first}.${mgrName.last}@riversidefc.example`.toLowerCase(),
      })
      .returning();
    await db.insert(teamMembersTable).values({
      teamId: team.id,
      userId: manager.id,
      role: "manager",
    });

    // Players
    const players: { id: number; first: string; last: string }[] = [];
    const squadSize = 11;
    for (let i = 0; i < squadSize; i++) {
      const n = nextName();
      const [player] = await db
        .insert(usersTable)
        .values({
          clubId: club.id,
          firstName: n.first,
          lastName: n.last,
          dateOfBirth: dobForAge(t.age),
        })
        .returning();
      await db.insert(teamMembersTable).values({
        teamId: team.id,
        userId: player.id,
        role: "player",
        jerseyNumber: i + 1,
        position: pick(POSITIONS, i),
      });
      players.push({ id: player.id, first: n.first, last: n.last });

      // Link a parent to younger players (under 13)
      if (t.age < 13) {
        const pn = nextName();
        const [parent] = await db
          .insert(usersTable)
          .values({
            clubId: club.id,
            firstName: pn.first,
            lastName: n.last,
            email: `${pn.first}.${n.last}@example.com`.toLowerCase(),
            phone: `555-02${String(rand(90) + 10)}`,
          })
          .returning();
        await db.insert(guardianshipsTable).values({
          guardianId: parent.id,
          playerId: player.id,
          relationship: "parent",
          canManage: true,
        });
      }
    }

    // Posts
    const [post1] = await db
      .insert(postsTable)
      .values({
        teamId: team.id,
        authorId: coach.id,
        title: "Welcome to the new season!",
        body: `Great to have everyone back for ${t.name}. Training kicks off this week — bring water, shin pads and plenty of energy. Let's make this a brilliant season.`,
        pinned: true,
        createdAt: daysFromNow(-6, 9),
      })
      .returning();
    await db.insert(postsTable).values({
      teamId: team.id,
      authorId: manager.id,
      title: "Kit orders due Friday",
      body: "Please confirm your sizes by Friday so we can place the team kit order in time for our first match.",
      createdAt: daysFromNow(-2, 18),
    });
    await db.insert(commentsTable).values({
      postId: post1.id,
      authorId: players[0].id,
      body: "Can't wait, see everyone at training!",
      createdAt: daysFromNow(-5, 10),
    });

    // Events (one past, two upcoming)
    await db.insert(eventsTable).values({
      teamId: team.id,
      createdById: coach.id,
      type: "training",
      title: "Pre-season training",
      location: "Riverside Park, Pitch 3",
      startsAt: daysFromNow(-3, 17),
      endsAt: daysFromNow(-3, 18),
      notes: "Focus on fitness and ball control.",
    });

    const [training] = await db
      .insert(eventsTable)
      .values({
        teamId: team.id,
        createdById: coach.id,
        type: "training",
        title: "Weekly training",
        location: "Riverside Park, Pitch 3",
        startsAt: daysFromNow(2, 17),
        endsAt: daysFromNow(2, 18),
        notes: "Small-sided games and finishing drills.",
      })
      .returning();

    const [game] = await db
      .insert(eventsTable)
      .values({
        teamId: team.id,
        createdById: coach.id,
        type: "game",
        title: `${t.name} vs Ashford Colts`,
        location: "Ashford Sports Ground",
        opponent: "Ashford Colts",
        startsAt: daysFromNow(5, 10),
        endsAt: daysFromNow(5, 11),
        notes: "Arrive 45 minutes early for warm-up.",
      })
      .returning();

    // RSVPs for the upcoming game (partial responses)
    for (let i = 0; i < players.length; i++) {
      if (i % 4 === 3) continue; // some no-response
      const status = i % 5 === 0 ? "maybe" : i % 7 === 0 ? "out" : "going";
      await db.insert(rsvpsTable).values({
        eventId: game.id,
        userId: players[i].id,
        status,
      });
      if (i % 3 === 0) {
        await db.insert(rsvpsTable).values({
          eventId: training.id,
          userId: players[i].id,
          status: "going",
        });
      }
    }

    // Team chat
    const [chat] = await db
      .insert(chatsTable)
      .values({
        clubId: club.id,
        teamId: team.id,
        name: `${t.name} Team Chat`,
        type: "team",
      })
      .returning();
    const chatMembers = [coach.id, manager.id, ...players.map((p) => p.id)];
    await db
      .insert(chatMembersTable)
      .values(chatMembers.map((userId) => ({ chatId: chat.id, userId })));
    await db.insert(messagesTable).values([
      {
        chatId: chat.id,
        authorId: coach.id,
        body: "Reminder: match this weekend, please RSVP when you get a chance.",
        createdAt: daysFromNow(-1, 12),
      },
      {
        chatId: chat.id,
        authorId: players[0].id,
        body: "I'm in! What time is kickoff?",
        createdAt: daysFromNow(-1, 13),
      },
      {
        chatId: chat.id,
        authorId: coach.id,
        body: "10am kickoff, be there for 9:15 to warm up.",
        createdAt: daysFromNow(-1, 13),
      },
    ]);

    console.log(`Seeded team ${t.name}`);
  }

  console.log("Seed complete.");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
