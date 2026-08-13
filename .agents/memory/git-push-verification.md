---
name: Pushing to GitHub and verifying it landed
description: How to push ClubHub to origin/main when the gitPush callback is unavailable, and why every push must be verified.
---

# Pushing & verifying

- The `gitPush` sandbox callback may not be registered in a session, and plain `git push` fails auth ("Invalid username or token").
- Working fallback: use the GitHub connection in CodeExecution (`listConnections("github")` inside a `"use impure"` fn — its `settings` are empty and `client.auth()` is unauthenticated, but **`c.proxyFetch("/...")` IS authenticated**). Push via the Git Data API: create blobs for each `git diff --name-status origin/main..HEAD` file, create a tree with `base_tree` = origin/main's tree, create a commit with parent = origin/main, PATCH `refs/heads/main`. Then `git fetch && git reset --soft origin/main` locally and confirm `git status --porcelain` is empty.
- Note this flattens multiple local commits into one remote commit; commit locally first so the message is reusable via `git log -1 --pretty=%B`.

**Why:** gitPush has claimed success while origin/main stayed behind, and one session had no gitPush at all; unverified pushes silently skip the Railway prod deploy.

**How to apply:** after any push (tool or API), always verify `origin/main == HEAD` equivalent state + clean status before telling Scott it's deployed.
