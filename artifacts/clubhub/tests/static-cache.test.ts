import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("artifacts/clubhub/public/sw.js", "utf8");

function worker(base = "/") {
  const handlers: Record<string, (event: any) => void> = {};
  const stored = new Map<string, Response>();
  const network: string[] = [];
  const deleted: string[] = [];
  const cache = {
    match: async (request: Request) => stored.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => { stored.set(request.url, response); },
    keys: async () => [...stored.keys()].map((url) => new Request(url)),
    delete: async (request: Request) => stored.delete(request.url),
  };
  vm.runInNewContext(source, {
    URL, console,
    self: {
      registration: { scope: `https://app.example${base}` },
      addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; },
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => ["nahreo-static-v0", "nahreo-static-v1", "unrelated-cache"],
      delete: async (key: string) => { deleted.push(key); },
    },
    fetch: async (request: Request) => {
      network.push(request.url);
      return new Response("asset contents", { headers: { "content-type": "application/javascript" } });
    },
  });
  async function request(path: string, method = "GET") {
    const pending: Promise<any>[] = [];
    let response: Promise<Response> | undefined;
    handlers.fetch({
      request: new Request(new URL(path, "https://app.example"), { method }),
      respondWith: (result: Promise<Response>) => { response = result; },
      waitUntil: (result: Promise<any>) => pending.push(result),
    });
    if (!response) return null;
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { request, stored, network, handlers, deleted };
}

test("only content-hashed static files are cached and reused", async () => {
  const w = worker();
  assert.equal(await (await w.request("/assets/index-123abc_X.js"))?.text(), "asset contents");
  assert.equal(await (await w.request("/assets/index-123abc_X.js"))?.text(), "asset contents");
  assert.equal(w.network.length, 1);
  assert.equal(w.stored.size, 1);
});

test("HTML, APIs, images, auth, foreign origins and mutations are never intercepted", async () => {
  const w = worker();
  for (const path of [
    "/", "/home", "/sign-in", "/api/me", "/api/feed", "/api/images/1",
    "/assets/plain.js", "/assets/index-123abc_X.js?token=private",
    "/assets/photo-123abc_X.png", "https://clerk.example/assets/index-123abc_X.js",
  ]) {
    assert.equal(await w.request(path), null, path);
  }
  assert.equal(await w.request("/assets/index-123abc_X.js", "POST"), null);
  assert.equal(w.stored.size, 0);
});

test("cache respects the artifact base path", async () => {
  const w = worker("/nahreo/");
  assert.equal(await w.request("/assets/index-123abc_X.js"), null);
  assert.ok(await w.request("/nahreo/assets/index-123abc_X.js"));
});

test("retained assets are bounded and activation only removes our old caches", async () => {
  const w = worker();
  for (let i = 0; i < 85; i++) await w.request(`/assets/page-${String(i).padStart(8, "0")}.js`);
  assert.equal(w.stored.size, 80);
  let pending: Promise<any> | undefined;
  w.handlers.activate({ waitUntil: (promise: Promise<any>) => { pending = promise; } });
  await pending;
  assert.deepEqual(w.deleted, ["nahreo-static-v0"]);
});
