import { randomBytes, randomUUID } from "node:crypto";
import { fail } from "./errors.js";

// All reads of received letters, contact details and conversations use this
// server-side mutual-match check. None are attached to feed responses.
export function createConnections({
  db,
  person,
  now,
  digest,
  publicProfile,
  swipe,
  encounterMinutes,
}) {
  if (
    !Number.isInteger(encounterMinutes) ||
    encounterMinutes < 1 ||
    encounterMinutes > 1440
  )
    throw Error("ENCOUNTER_MINUTES must be between 1 and 1440.");
  db.exec(`
    CREATE TABLE IF NOT EXISTS letters_v1(sender TEXT NOT NULL REFERENCES people_v2(id), recipient TEXT NOT NULL REFERENCES people_v2(id), body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(sender,recipient), CHECK(sender!=recipient));
    CREATE TABLE IF NOT EXISTS encounters_v1(token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE REFERENCES people_v2(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages_v1(id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES people_v2(id), recipient TEXT NOT NULL REFERENCES people_v2(id), body TEXT NOT NULL, created_at INTEGER NOT NULL, request_id TEXT NOT NULL, UNIQUE(sender,recipient,request_id), CHECK(sender!=recipient));
    CREATE INDEX IF NOT EXISTS messages_pair ON messages_v1(sender,recipient,created_at);
    CREATE TABLE IF NOT EXISTS shared_contacts_v1(owner TEXT NOT NULL REFERENCES people_v2(id), recipient TEXT NOT NULL REFERENCES people_v2(id), phone TEXT NOT NULL, PRIMARY KEY(owner,recipient), CHECK(owner!=recipient));
  `);
  function requireMatch(viewer, target) {
    const p = person(target),
      me = person(viewer);
    const [a, b] = [viewer, target].sort();
    const matched = db
      .prepare("SELECT 1 FROM mutual_v2 WHERE a=? AND b=?")
      .get(a, b);
    if (!p || !matched || !p.published || (!p.mock && !me.published))
      fail("Connection unavailable.", 404);
    return p;
  }
  function validateLetterTarget(sender, target) {
    if (typeof target !== "string" || sender === target)
      fail("Choose another profile.");
    const p = person(target);
    if (!p || !p.published) fail("Profile unavailable.", 404);
  }
  function encounter(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token))
      fail("This encounter card has expired or is unavailable.", 404);
    const row = db
      .prepare("SELECT * FROM encounters_v1 WHERE token_hash=? AND expires>?")
      .get(digest(token), now());
    if (!row || !person(row.owner)?.published)
      fail("This encounter card has expired or is unavailable.", 404);
    return row;
  }
  return {
    ownLetter(sender, target) {
      validateLetterTarget(sender, target);
      return (
        db
          .prepare(
            "SELECT body,updated_at AS updatedAt FROM letters_v1 WHERE sender=? AND recipient=?",
          )
          .get(sender, target) || { body: "", updatedAt: null }
      );
    },
    writeLetter(sender, target, body) {
      validateLetterTarget(sender, target);
      if (typeof body !== "string" || body.length > 2000)
        fail("Your letter must be 2,000 characters or fewer.");
      if (!body.trim())
        db.prepare("DELETE FROM letters_v1 WHERE sender=? AND recipient=?").run(
          sender,
          target,
        );
      else
        db.prepare(
          "INSERT INTO letters_v1 VALUES(?,?,?,?) ON CONFLICT(sender,recipient) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
        ).run(sender, target, body.trim(), now());
      return { saved: true };
    },
    connection(viewer, target) {
      const p = requireMatch(viewer, target);
      const rows = db
        .prepare(
          "SELECT id,sender,body,created_at FROM messages_v1 WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) ORDER BY rowid DESC LIMIT 100",
        )
        .all(viewer, target, target, viewer)
        .reverse();
      return {
        profile: publicProfile(p),
        receivedLetter:
          db
            .prepare(
              "SELECT body FROM letters_v1 WHERE sender=? AND recipient=?",
            )
            .get(target, viewer)?.body || null,
        sharedPhone:
          db
            .prepare(
              "SELECT phone FROM shared_contacts_v1 WHERE owner=? AND recipient=?",
            )
            .get(target, viewer)?.phone || null,
        ownPhone:
          db
            .prepare(
              "SELECT phone FROM shared_contacts_v1 WHERE owner=? AND recipient=?",
            )
            .get(viewer, target)?.phone || "",
        messages: rows.map((m) => ({
          id: m.id,
          mine: m.sender === viewer,
          body: m.body,
          sentAt: new Date(m.created_at).toISOString(),
        })),
      };
    },
    sendMessage(sender, target, body, requestId) {
      requireMatch(sender, target);
      if (
        typeof body !== "string" ||
        !body.trim() ||
        body.length > 1000 ||
        typeof requestId !== "string" ||
        !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)
      )
        fail("Write a message of 1–1,000 characters.");
      const previous = db
        .prepare(
          "SELECT body FROM messages_v1 WHERE sender=? AND recipient=? AND request_id=?",
        )
        .get(sender, target, requestId);
      if (previous && previous.body !== body.trim())
        fail("Request already used for a different message.", 409);
      if (!previous)
        db.prepare("INSERT INTO messages_v1 VALUES(?,?,?,?,?,?)").run(
          randomUUID(),
          sender,
          target,
          body.trim(),
          now(),
          requestId,
        );
      return { sent: true };
    },
    shareContact(owner, target, phone) {
      const p = requireMatch(owner, target);
      if (p.mock) fail("Contact sharing is available only with real users.");
      if (typeof phone !== "string")
        fail("Enter a phone number with its country code.");
      const normalized = phone.replace(/[\s()-]/g, "");
      if (normalized && !/^\+[1-9]\d{7,14}$/.test(normalized))
        fail("Use international format, such as +919876543210.");
      if (!normalized)
        db.prepare(
          "DELETE FROM shared_contacts_v1 WHERE owner=? AND recipient=?",
        ).run(owner, target);
      else
        db.prepare(
          "INSERT INTO shared_contacts_v1 VALUES(?,?,?) ON CONFLICT(owner,recipient) DO UPDATE SET phone=excluded.phone",
        ).run(owner, target, normalized);
      return { shared: !!normalized };
    },
    createEncounter(owner) {
      if (!person(owner).published)
        fail("Publish your profile before creating an encounter card.", 409);
      const token = randomBytes(24).toString("hex"),
        expires = now() + encounterMinutes * 60000;
      db.prepare("DELETE FROM encounters_v1 WHERE expires<=?").run(now());
      db.prepare(
        "INSERT INTO encounters_v1 VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires",
      ).run(digest(token), owner, expires);
      return { token, expiresAt: new Date(expires).toISOString() };
    },
    revokeEncounter(owner) {
      db.prepare("DELETE FROM encounters_v1 WHERE owner=?").run(owner);
      return { revoked: true };
    },
    previewEncounter(viewer, token) {
      const card = encounter(token);
      if (card.owner === viewer)
        fail("This is your card. Share it with the person you met.");
      return {
        profile: publicProfile(person(card.owner)),
        expiresAt: new Date(card.expires).toISOString(),
      };
    },
    likeEncounter(viewer, token) {
      const card = encounter(token);
      // An explicit exchanged card allows reconnecting regardless of radius.
      // Publication, mutuality and immutable decisions still apply.
      return swipe(viewer, card.owner, "like", true);
    },
  };
}
