import { test } from "node:test";
// Run from repo root: pnpm --filter @workspace/api-server exec esbuild ../clubhub/tests/push-enrollment.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/push-enrollment.test.cjs
// Then: node --test /tmp/push-enrollment.test.cjs
import assert from "node:assert/strict";
import {
  clearPushPromptDismissal, dismissPushPrompt, enableDevicePush,
  hasSavedPushRegistration, isPushPromptDismissed,
} from "../src/lib/push-enrollment";

let nextPerson = 9000;
function browser(options: { permission?: string; answer?: string; existing?: boolean; incomplete?: boolean; activation?: "wait" | "fail" } = {}) {
  const calls: string[] = [];
  const storage = new Map<string, string>();
  let permission = options.permission ?? "default";
  const endpoint = "https://fcm.googleapis.com/fcm/send/synthetic-not-a-real-subscription";
  const subscription = {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: options.incomplete ? {} : { p256dh: "synthetic-public-key", auth: "synthetic-auth-key" },
    }),
  };
  const worker = Object.assign(new EventTarget(), { state: options.activation ? "installing" : "activated" });
  const registration = {
    active: options.activation ? null : worker,
    installing: options.activation ? worker : null,
    pushManager: {
      getSubscription: async () => options.existing ? subscription : null,
      subscribe: async () => { calls.push("subscribe"); return subscription; },
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    atob: globalThis.atob,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    serviceWorker: {
      register: async () => {
        calls.push("register");
        if (options.activation) setTimeout(() => {
          worker.state = options.activation === "fail" ? "redundant" : "activated";
          calls.push(worker.state);
          worker.dispatchEvent(new Event("statechange"));
        }, 1);
        return registration;
      },
    },
  } });
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: {
    get permission() { return permission; },
    requestPermission: async () => { calls.push("permission"); permission = options.answer ?? "granted"; return permission; },
  } });
  const personId = nextPerson++;
  return { calls, endpoint, personId, scope: `/test-${personId}` };
}

test("requests permission from the click before creating or saving a subscription", async () => {
  const b = browser();
  const promise = enableDevicePush(b.personId, "AQID", b.scope, async (payload) => {
    assert.equal(payload.endpoint, b.endpoint);
    assert.equal(hasSavedPushRegistration(b.personId, b.endpoint, true, b.scope), false);
    b.calls.push("save");
  });
  assert.deepEqual(b.calls, ["permission"]);
  await promise;
  assert.deepEqual(b.calls, ["permission", "register", "subscribe", "save"]);
  assert.equal(hasSavedPushRegistration(b.personId, b.endpoint, true, b.scope), true);
  assert.equal(hasSavedPushRegistration(b.personId, b.endpoint, false, b.scope), false);
  assert.equal(hasSavedPushRegistration(b.personId + 1, b.endpoint, true, b.scope), false);
  assert.equal(hasSavedPushRegistration(b.personId, "different-endpoint", true, b.scope), false);
});

test("blocked permission never prompts or registers or saves", async () => {
  const b = browser({ permission: "denied" });
  await assert.rejects(enableDevicePush(b.personId, "AQID", b.scope, async () => {
    throw Error("Must not save");
  }), /blocked/);
  assert.deepEqual(b.calls, []);
});

test("declining or dismissing the permission dialog never registers or saves", async () => {
  for (const answer of ["denied", "default"]) {
    const b = browser({ answer });
    await assert.rejects(enableDevicePush(b.personId, "AQID", b.scope, async () => {
      throw Error("Must not save");
    }));
    assert.deepEqual(b.calls, ["permission"]);
  }
});

test("granted permission reuses the existing subscription without another permission dialog", async () => {
  const b = browser({ permission: "granted", existing: true });
  await enableDevicePush(b.personId, "AQID", b.scope, async () => { b.calls.push("save"); });
  assert.deepEqual(b.calls, ["register", "save"]);
});

test("failed server save remains unregistered even if another device enabled the account", async () => {
  const b = browser({ permission: "granted" });
  await assert.rejects(enableDevicePush(b.personId, "AQID", b.scope, async () => {
    throw Error("Server unavailable");
  }), /Server unavailable/);
  assert.equal(hasSavedPushRegistration(b.personId, b.endpoint, true, b.scope), false);
});

test("incomplete browser subscriptions never reach the server", async () => {
  const b = browser({ permission: "granted", incomplete: true });
  await assert.rejects(enableDevicePush(b.personId, "AQID", b.scope, async () => {
    throw Error("Must not save");
  }), /incomplete/);
});

test("dismissal is per account and install guidance cannot suppress the installed-app prompt", () => {
  const b = browser();
  dismissPushPrompt(b.personId, "install");
  assert.equal(isPushPromptDismissed(b.personId, "install"), true);
  assert.equal(isPushPromptDismissed(b.personId, "enable"), false);
  assert.equal(isPushPromptDismissed(b.personId + 1, "install"), false);
  dismissPushPrompt(b.personId, "enable");
  assert.equal(isPushPromptDismissed(b.personId, "enable"), true);
  clearPushPromptDismissal(b.personId);
  assert.equal(isPushPromptDismissed(b.personId, "enable"), false);
});

test("successful enrollment clears a previous dismissal", async () => {
  const b = browser({ permission: "granted" });
  dismissPushPrompt(b.personId, "enable");
  await enableDevicePush(b.personId, "AQID", b.scope, async () => {});
  assert.equal(isPushPromptDismissed(b.personId, "enable"), false);
});

test("first-time setup waits for the service worker to activate before subscribing", async () => {
  const b = browser({ permission: "granted", activation: "wait" });
  await enableDevicePush(b.personId, "AQID", b.scope, async () => { b.calls.push("save"); });
  assert.deepEqual(b.calls, ["register", "activated", "subscribe", "save"]);
});

test("failed worker activation reports an error without subscribing or saving", async () => {
  const b = browser({ permission: "granted", activation: "fail" });
  await assert.rejects(enableDevicePush(b.personId, "AQID", b.scope, async () => {
    throw Error("Must not save");
  }), /could not start/);
  assert.deepEqual(b.calls, ["register", "redundant"]);
});
