# Nahreo launch testing — 27 October 2026

## Scope and safety

This was a focused launch-readiness pass, not a claim that every possible device,
failure mode or security attack has been tested.

- Automated API tests used a disposable PostgreSQL database.
- Browser checks used isolated synthetic development clubs, people and Clerk
  test identities. No real invitations, email deliveries or Google account
  sign-ins were performed.
- No production club data, authentication configuration or database schema was
  changed by this testing.
- Synthetic browser-test clubs, people, events, invitations and Clerk accounts
  were removed after verification. Temporary credential/fixture files were removed.

## Automated results

**189 tests passed across 21 test files**, including the guardian RSVP follow-up.
API and frontend TypeScript checking and the web build also passed.
The pass and follow-up added 43 regression cases beyond the original 146 tests.

Command:

```sh
bash artifacts/api-server/scripts/run-tests.sh
```

Coverage includes:

- Invitation recipient matching, verified-email claiming and safe reuse of an
  existing permanent account across clubs.
- Restricted new-club setup and rejection of invalid setup invitations.
- Team departures that preserve account identity, other memberships and history.
- Event creation/edit/cancel/delete rejection for unauthorised roles.
- Coach, manager, club-admin, player and guardian RSVP-on-behalf boundaries.
- Read-only guardianship links and rejection of nonmember RSVP targets.
- Private email, phone and biography fields in profiles, directories, attendance
  responses and chat-member responses.
- Distinction between club-admin-only information and coach access.
- Club-scoped profile membership results for a person belonging to two clubs.
- Existing age-feature, monitoring, learning-preference, storage, image,
  notification and other regression tests.

The suite is useful evidence for these checked behaviours, not proof that all
features have exhaustive test coverage.

## Browser results

The invitation preview was checked on desktop and at a 390-pixel mobile width.
Authenticated checks used the normal in-app Clerk SDK ticket strategy with
synthetic verified development identities.

Verified:

- A valid invite displays the correct team, player role, sign-in and
  account-creation choices.
- Invalid and expired invitations show an explicit unavailable message.
- An existing person can accept an invitation to another club. The invitation
  placeholder is safely reconciled; the permanent person, original home club,
  prior team memberships and historical RSVP remain.
- Acceptance switches to the invited club context.
- A wrong verified email cannot accept the invitation or gain membership.
- A coach sees staff controls for their own team, not an unrelated team's content.
- A guardian can open their linked child's profile and see that child's absence
  reason, but cannot open an unrelated child's profile or unrelated team event.
- A guardian's attempted RSVP for an unrelated child is rejected without mutation.
- After correcting the invalid synthetic RSVP fixture, the guardian's Team A
  attendance view showed only their linked child, not the Team-B-only child.

Not counted as an application defect:

- The initial hosted Clerk ticket-link approach could not redirect to the preview
  origin. Normal in-app SDK authentication worked without configuration changes.
- A manually seeded RSVP initially attached a Team-B-only child to a Team A
  event. Normal RSVP writes reject nonmembers. This invalid fixture must not be
  confused with a supported application action or used to justify hiding valid
  historical attendance for departed members.

## Reproduced defect and correction

**Cross-club team-membership details in person profiles.** An authorised profile
viewer could receive memberships from both clubs when the person belonged to two
clubs. The profile's nested memberships are now filtered to the request's current
club. Regression cases check viewers from both clubs and confirm that the stored
memberships and original home-club identity remain intact.

This is a response-scoping fix, not a data migration or membership deletion.

## Guardian RSVP follow-up — resolved and verified

The event page now offers a separate RSVP for each manageable child on the
event's team, including children who have not yet responded. The server derives
these targets from team membership and a guardianship with management permission.

A focused desktop and 390-pixel mobile browser pass verified:

- Exactly the two manageable children on the event's team have controls; the
  other-team child and unrelated child do not.
- Going and Not going save to the correct child's account, persist after reload,
  and update attendance without changing the other child or RSVPing the guardian.
- Absence reasons are optional. Going clears a previous reason.
- Cancelling an absence edit causes no write.
- A simulated failed save shows an error, leaves stored responses unchanged,
  and can be retried successfully.
- Read-only guardians, cancelled events and coaches-only events show no child
  RSVP controls.

Event details refresh every 30 seconds so another guardian's changes and
cancellation/permission changes can become visible while the page stays open.

## Remaining functional gap

**Selected-team Schedule filtering:** selecting Team A still displayed events
for both accessible teams. No inaccessible club's events appeared, so this is a
context/filtering issue rather than evidence of unauthorised event access.
It remains separate to the completed guardian RSVP fix.

## Checks still needed outside this pass

- Real Google consent and email/password or email-code journeys for production.
- Actual invitation and recovery-email delivery, including spam handling.
- Installation, camera/photo uploads and background notifications on physical
  iPhones and Android phones.
- Browser/device session persistence over time.
- Backup restoration and incident recovery.
- Production capacity/load and sustained concurrent use.

No load test, penetration-test certification or full security audit was performed.
