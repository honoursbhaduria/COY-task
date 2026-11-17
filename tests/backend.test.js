import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createStore, distanceKm } from "../server/store.js";
import { createApp } from "../server/app.js";
const profile = (name) => ({
  name,
  age: 24,
  bio: "Coffee and long walks.",
  city: "Bengaluru",
  college: "",
  interests: ["Coffee"],
  published: true,
});
test("independent users, private likes, real mutuality, retries and persistence", () => {
  const dir = mkdtempSync(join(tmpdir(), "coy-store-"));
  const file = join(dir, "db.sqlite");
  let s = createStore(file);
  try {
    const a = s.createSession(),
      b = s.createSession();
    assert.equal(s.feed(a.id).length, 32);
    assert.equal(s.feed(b.id).length, 32);
    s.edit(a.id, profile("Alice"));
    s.edit(b.id, profile("Bob"));
    assert.equal(s.swipe(a.id, b.id, "like").matched, false);
    assert.equal(s.matches(b.id).length, 0);
    const payload = JSON.stringify(s.feed(b.id));
    assert.ok(!payload.includes("likedMe"));
    assert.ok(
      s
        .feed(b.id)
        .every((p) => !("lat" in p) && !("lon" in p) && !("token" in p)),
    );
    assert.equal(s.swipe(b.id, a.id, "like").matched, true);
    assert.equal(s.matches(a.id)[0].name, "Bob");
    assert.equal(s.matches(b.id)[0].name, "Alice");
    assert.equal(s.swipe(a.id, b.id, "like").alreadyRecorded, true);
    assert.throws(() => s.swipe(a.id, b.id, "pass"), { status: 409 });
    assert.equal(s.swipe(a.id, "p01", "like").matched, true);
    assert.equal(s.swipe(a.id, "p02", "like").matched, false);
    assert.equal(s.swipe(a.id, "p04", "pass").matched, false);
    assert.ok(s.feed(b.id).some((p) => p.id === "p01"));
    assert.throws(() => s.swipe(a.id, "missing", "like"), { status: 404 });
    assert.throws(() => s.swipe(a.id, "p03", "invalid"), { status: 400 });
    s.close();
    s = createStore(file);
    assert.equal(s.resolveSession(a.token), a.id);
    assert.equal(s.matches(a.id).length, 2);
    assert.ok(!s.feed(a.id).some((p) => p.id === "p01"));
    s.edit(b.id, { ...profile("Bob"), published: false });
    assert.ok(!s.matches(a.id).some((p) => p.id === b.id));
    for (const p of s.feed(a.id)) s.swipe(a.id, p.id, "pass");
    assert.equal(s.feed(a.id).length, 0);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("swipes are unlimited, idempotent, and not restricted by daily limits", () => {
  const s = createStore(":memory:");
  try {
    const { id } = s.createSession();
    assert.equal(s.swipe(id, "p01", "like").matched, true);
    assert.equal(s.swipe(id, "p01", "like").alreadyRecorded, true);
    assert.equal(s.swipe(id, "p02", "pass").matched, false);
    assert.equal(s.swipe(id, "p03", "like").matched, false);
    assert.equal(s.swipe(id, "p04", "pass").matched, false);
  } finally {
    s.close();
  }
});
test("location consent, radius enforcement, no coordinate exposure and validation", () => {
  const s = createStore(":memory:");
  try {
    const a = s.createSession(),
      b = s.createSession();
    s.edit(a.id, profile("A"));
    s.edit(b.id, profile("B"));
    s.location(a.id, {
      enabled: true,
      latitude: 12.9716,
      longitude: 77.5946,
      radius: 50,
    });
    let f = s.feed(a.id);
    assert.ok(f.length > 0 && f.length < 32);
    assert.ok(f.every((p) => p.city === "Bengaluru"));
    assert.ok(
      f.every((p) => !("lat" in p) && !("lon" in p) && p.distanceKm >= 5),
    );
    assert.ok(!f.some((p) => p.id === b.id));
    assert.throws(() => s.swipe(a.id, "p02", "like"), { status: 409 });
    s.location(b.id, {
      enabled: true,
      latitude: 12.97,
      longitude: 77.59,
      radius: 50,
    });
    assert.ok(s.feed(a.id).some((p) => p.id === b.id));
    s.location(a.id, { enabled: false });
    assert.equal(s.me(a.id).locationEnabled, false);
    assert.equal(s.feed(a.id).length, 33);
    assert.throws(
      () =>
        s.location(a.id, {
          enabled: true,
          latitude: 999,
          longitude: 0,
          radius: 50,
        }),
      { status: 400 },
    );
    assert.throws(() => s.edit(a.id, { ...profile("A"), age: 17 }), {
      status: 400,
    });
    assert.throws(() => s.edit(a.id, { ...profile("A"), id: b.id }), {
      status: 400,
    });
    assert.ok(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) > 111);
  } finally {
    s.close();
  }
});
test("API sessions, CSRF, uploads, isolation, and malformed inputs", async () => {
  const s = createStore(":memory:");
  const server = createApp(s).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function client() {
    const r = await fetch(base + "/session", {
      method: "POST",
      headers: { "X-Coy-Request": "1" },
    });
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const user = (await r.json()).user;
    return {
      user,
      call: (path, body) =>
        fetch(base + path, {
          method: body ? "POST" : "GET",
          headers: {
            Cookie: cookie,
            "X-Coy-Request": "1",
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      cookie,
    };
  }
  try {
    assert.equal((await fetch(base + "/feed")).status, 401);
    assert.equal(
      (await fetch(base + "/session", { method: "POST" })).status,
      403,
    );
    const a = await client(),
      b = await client();
    assert.notEqual(a.user.id, b.user.id);
    const r = await a.call("/feed");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal((await r.json()).profiles.length, 32);
    assert.equal((await a.call("/profile", profile("Alice"))).status, 200);
    assert.equal(
      (
        await fetch(base + "/profile", {
          method: "POST",
          headers: { Cookie: a.cookie, "Content-Type": "application/json" },
          body: JSON.stringify(profile("Hacked")),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/swipe", {
          method: "POST",
          headers: {
            Cookie: a.cookie,
            "X-Coy-Request": "1",
            "Content-Type": "application/json",
          },
          body: "{",
        })
      ).status,
      400,
    );
    const bytes = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#ff3d81" },
    })
      .png()
      .toBuffer();
    const upload = await fetch(base + "/photo", {
      method: "POST",
      headers: {
        Cookie: a.cookie,
        "X-Coy-Request": "1",
        "Content-Type": "image/png",
      },
      body: bytes,
    });
    assert.equal(upload.status, 200);
    const photo = (await upload.json()).user.photo;
    const image = await b.call(photo);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    const bad = await fetch(base + "/photo", {
      method: "POST",
      headers: {
        Cookie: a.cookie,
        "X-Coy-Request": "1",
        "Content-Type": "image/png",
      },
      body: "not an image",
    });
    assert.equal(bad.status, 400);
    await a.call("/profile", { ...profile("Alice"), published: false });
    assert.equal((await b.call(photo)).status, 404);
    await a.call("/profile", {
      ...profile("Alice"),
      avatar: "/portraits/1.svg",
    });
    assert.equal((await a.call(photo)).status, 404);
    assert.equal(
      (await a.call("/swipe", { profileId: "p01", action: "like" })).status,
      200,
    );
    assert.equal((await (await b.call("/matches")).json()).matches.length, 0);
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
});
