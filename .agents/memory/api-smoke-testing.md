---
name: API smoke testing from the shell
description: How to curl the api-server with a real Clerk identity, and a proxy gotcha with POSTs.
---

# Smoke-testing the API

- The shared proxy at `localhost:80/api-server/...` serves GETs fine but returns empty `404` for POSTs from curl. Hit the api-server directly on its assigned `PORT` (find via `/proc/<pid>/environ` of the workflow process) — e.g. `http://localhost:8080/api/...`.
- To act as a real user: create a Clerk session (`POST https://api.clerk.com/v1/sessions` with `{"user_id":...}` using `CLERK_SECRET_KEY`), then mint a JWT (`POST /v1/sessions/<id>/tokens` with `-H "Content-Type: application/json" -d '{}'` — the empty body + content type is required), and send it as `Authorization: Bearer`.
- `python3` is not on PATH; use `node -e` for JSON parsing in shell pipelines.

**Why:** cost several failed curl rounds; the POST-404 looks like a routing bug but isn't.
