import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { createApp } from "../server/app.js";
const profile = (name) => ({
  name,
  age: 25,
  bio: "Coffee and conversation.",
  city: "Bengaluru",
  college: "",
  interests: [],
  published: true,
});
function setup(options = {}) {
  const store = createStore(":memory:", options);
  const users = ["Alice", "Bob", "Charlie"].map((name) => {
    const { id } = store.createSession();
    store.edit(id, profile(name));
    return id;
  });
  return { store, users };
}
test("Unsent remains private until mutuality; messages and phone sharing enforce the same boundary", () => {
  const {
    store: s,
    users: [a, b, c],
  } = setup();
  try {
    s.writeLetter(a, b, "I loved our conversation.");
    assert.equal(s.ownLetter(a, b).body, "I loved our conversation.");
    assert.equal(s.ownLetter(b, a).body, "");
    assert.throws(() => s.connection(b, a), { status: 404 });
    assert.throws(() => s.sendMessage(a, b, "Hello", "request-123456789"), {
      status: 404,
    });
    assert.throws(() => s.shareContact(a, b, "+919876543210"), { status: 404 });
    s.swipe(a, b, "like");
    assert.throws(() => s.connection(b, a), { status: 404 });
    assert.equal(s.matches(b).length, 0);
    assert.ok(!JSON.stringify(s.feed(b)).includes("I loved our conversation."));
    s.swipe(b, a, "like");
    assert.equal(
      s.connection(b, a).receivedLetter,
      "I loved our conversation.",
    );
    assert.equal(s.connection(a, b).receivedLetter, null);
    assert.throws(() => s.connection(c, a), { status: 404 });
    s.sendMessage(a, b, "Hi Bob!", "request-123456789");
    s.sendMessage(a, b, "Hi Bob!", "request-123456789");
    assert.equal(s.connection(b, a).messages.length, 1);
    assert.equal(s.connection(b, a).messages[0].mine, false);
    assert.throws(() => s.sendMessage(a, b, "Different", "request-123456789"), {
      status: 409,
    });
    assert.throws(() => s.shareContact(a, b, "123"), { status: 400 });
    s.shareContact(a, b, "+91 98765 43210");
    assert.equal(s.connection(b, a).sharedPhone, "+919876543210");
    assert.equal(s.connection(a, b).sharedPhone, null);
    assert.ok(!JSON.stringify(s.matches(b)).includes("9876543210"));
    assert.ok(!JSON.stringify(s.feed(c)).includes("9876543210"));
    s.shareContact(a, b, "");
    assert.equal(s.connection(b, a).sharedPhone, null);
    s.writeLetter(a, b, "");
    assert.equal(s.connection(b, a).receivedLetter, null);
    assert.throws(() => s.writeLetter(a, b, "x".repeat(2001)), { status: 400 });
    assert.throws(
      () => s.sendMessage(a, b, "x".repeat(1001), "request-123456788"),
      { status: 400 },
    );
    s.edit(a, { ...profile("Alice"), published: false });
    assert.throws(() => s.connection(b, a), { status: 404 });
    assert.throws(() => s.sendMessage(b, a, "hi", "request-123456788"), {
      status: 404,
    });
  } finally {
    s.close();
  }
});
test("Encounter cards expire, rotate, revoke, and allow reconnection outside nearby radius", () => {
  let time = Date.parse("2026-11-18T10:00:00Z");
  const {
    store: s,
    users: [a, b, c],
  } = setup({ now: () => time, encounterMinutes: 1 });
  try {
    const card = s.createEncounter(a);
    const preview = s.previewEncounter(b, card.token);
    assert.equal(preview.profile.id, a);
    assert.ok(!("phone" in preview.profile));
    assert.throws(() => s.previewEncounter(a, card.token), { status: 400 });
    const replacement = s.createEncounter(a);
    assert.throws(() => s.previewEncounter(b, card.token), { status: 404 });
    s.revokeEncounter(a);
    assert.throws(() => s.previewEncounter(b, replacement.token), {
      status: 404,
    });
    const expiring = s.createEncounter(a);
    time += 60001;
    assert.throws(() => s.likeEncounter(b, expiring.token), { status: 404 });
    const ca = s.createEncounter(a),
      cb = s.createEncounter(b);
    s.location(a, { enabled: true, latitude: 0, longitude: 0, radius: 5 });
    assert.throws(() => s.swipe(a, b, "like"), { status: 409 });
    assert.equal(s.likeEncounter(a, cb.token).matched, false);
    assert.equal(s.likeEncounter(b, ca.token).matched, true);
    assert.equal(s.likeEncounter(b, ca.token).alreadyRecorded, true);
    assert.equal(s.likeEncounter(a, s.createEncounter(c).token).matched, false);
    s.edit(c, { ...profile("Charlie"), published: false });
    assert.throws(() => s.createEncounter(c), { status: 409 });
  } finally {
    s.close();
  }
});
test("Connection HTTP routes enforce session, cross-user ownership and match checks", async () => {
  const s = createStore(":memory:");
  const server = createApp(s).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function client(name) {
    const r = await fetch(base + "/session", {
      method: "POST",
      headers: { "X-Coy-Request": "1" },
    });
    const cookie = r.headers.get("set-cookie").split(";")[0],
      id = (await r.json()).user.id;
    const call = (path, body) =>
      fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Coy-Request": "1",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    await call("/profile", profile(name));
    return { call, id };
  }
  try {
    const a = await client("Alice"),
      b = await client("Bob");
    await a.call(`/letters/${b.id}`, { body: "Only for Bob" });
    assert.equal((await b.call(`/connections/${a.id}`)).status, 404);
    assert.equal(
      (await (await b.call(`/letters/${a.id}`)).json()).letter.body,
      "",
    );
    assert.equal((await fetch(base + `/connections/${a.id}`)).status, 401);
    const card = await (await a.call("/encounters", {})).json();
    await b.call(`/encounters/${card.token}/like`, {});
    await a.call("/swipe", { profileId: b.id, action: "like" });
    assert.equal(
      (await (await b.call(`/connections/${a.id}`)).json()).receivedLetter,
      "Only for Bob",
    );
    await a.call(`/connections/${b.id}/messages`, {
      body: "Hi!",
      requestId: "browser-request-123456",
    });
    assert.equal(
      (await (await b.call(`/connections/${a.id}`)).json()).messages[0].body,
      "Hi!",
    );
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
});
test("scanned encounters persist independently of token expiry and never send a like", () => {
  let clock = Date.parse("2026-11-18T10:00:00Z");
  const {
    store: s,
    users: [a, b, c],
  } = setup({ now: () => clock, encounterMinutes: 1 });
  try {
    const card = s.createEncounter(a);
    s.saveEncounter(b, card.token);
    s.saveEncounter(b, card.token);
    assert.equal(s.savedEncounters(b).length, 1);
    assert.equal(s.savedEncounters(c).length, 0);
    assert.equal(s.matches(a).length, 0);

    clock += 61000;
    assert.equal(s.savedEncounters(b)[0].id, a);
    assert.throws(() => s.saveEncounter(c, card.token), { status: 404 });
    assert.equal(s.crushEncounter(b, a).matched, false);
    assert.throws(() => s.crushEncounter(c, a), { status: 404 });
  } finally {
    s.close();
  }
});
test("profile IDs save encounters without trusting a scanned name or exposing contacts", () => {
  const {
    store: s,
    users: [a, b, c],
  } = setup();
  try {
    s.saveProfileEncounter(b, a);
    s.saveProfileEncounter(b, a);
    assert.equal(s.savedEncounters(b).length, 1);
    assert.equal(s.savedEncounters(b)[0].name, "Alice");
    assert.equal(s.savedEncounters(c).length, 0);
    assert.throws(() => s.saveProfileEncounter(a, a), { status: 400 });
    assert.throws(() => s.saveProfileEncounter(c, "not-an-id"), {
      status: 400,
    });
    assert.equal(s.matches(a).length, 0);
    s.edit(a, { ...profile("Alice"), published: false });
    assert.throws(() => s.saveProfileEncounter(c, a), { status: 404 });
  } finally {
    s.close();
  }
});
