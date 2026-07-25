---
name: Verify gitPush actually landed
description: gitPush can report success while leaving commits or working-tree changes unpushed; always verify origin/main == HEAD and clean status.
---

# Verify every prod push

- The `gitPush({})` callback has twice reported `success:true` while origin/main stayed behind (once with an unpushed local commit, once with uncommitted working-tree changes it didn't pick up).
- **How to apply:** after every push, run `git fetch && git rev-parse origin/main HEAD && git status --short`. If HEAD != origin/main or files are dirty, commit manually (`git add`/`git commit`) then call `gitPush({})` again — direct `git push` fails auth (token not in remote URL); only the callback can push.
- **Why:** Railway deploys from GitHub; a "successful" push that didn't land means Scott tests stale prod on his phone and reports missing features.
