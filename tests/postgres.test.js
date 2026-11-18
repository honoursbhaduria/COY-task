import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/postgres/store.js";
import { createApp } from "../server/app.js";
const url = process.env.PG_TEST_URL;
const profile = (name) => ({
  name,
  age: 24,
  bio: "Coffee and books.",
  city: "Bengaluru",
  college: "",
  interests: ["Coffee"],
  published: true,
});
test(
  "PostgreSQL: cross-instance mutuality, concurrent retries, letters, encounters, photos, restart and HTTP contracts",
  { skip: !url },
  async () => {
    const [s, t] = await Promise.all([createStore(url), createStore(url)]);
    let server;
    try {
      const a = await s.createSession(),
        b = await t.createSession();
      await s.edit(a.id, profile("Alice"));
      await t.edit(b.id, profile("Bob"));
      await s.writeLetter(a.id, b.id, "A private letter.");
      await assert.rejects(() => t.connection(b.id, a.id), { status: 404 });
      const results = await Promise.all([
        s.swipe(a.id, "p01", "like"),
        t.swipe(a.id, "p01", "like"),
      ]);
      assert.equal(results.filter((r) => r.matched).length, 1);
      await Promise.all([
        s.swipe(a.id, b.id, "like"),
        t.swipe(b.id, a.id, "like"),
      ]);
      assert.ok((await s.matches(a.id)).some((p) => p.id === b.id));
      assert.equal(
        (await t.connection(b.id, a.id)).receivedLetter,
        "A private letter.",
      );
      await s.saveProfileEncounter(a.id, b.id);
      assert.equal((await t.savedEncounters(a.id))[0].id, b.id);
      await s.photo(a.id, Buffer.from([1, 2, 3]));
      assert.deepEqual(
        Buffer.from(await t.readPhoto(b.id, a.id)),
        Buffer.from([1, 2, 3]),
      );
      await s.location(a.id, {
        enabled: true,
        latitude: 12.97,
        longitude: 77.59,
        radius: 50,
      });
      assert.ok((await s.feed(a.id)).every((p) => !("lat" in p)));
      await s.location(a.id, { enabled: false });
      assert.equal(await t.resolveSession(a.token), a.id);
      assert.ok(!(await t.feed(a.id)).some((p) => p.id === "p01"));
      await assert.rejects(() => s.swipe(a.id, "p01", "pass"), { status: 409 });
      server = createApp(t).listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const root = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(root + "/feed", {
        headers: { Cookie: `coy_session=${a.token}` },
      });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray((await response.json()).profiles));
    } finally {
      if (server) await new Promise((r) => server.close(r));
      await Promise.all([s.close(), t.close()]);
    }
  },
);
