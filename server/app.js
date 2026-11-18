import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import sharp from "sharp";
import { fail } from "./errors.js";

export function createApp(
  store,
  { secureCookies = false, production = false } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      strictTransportSecurity: false,
      contentSecurityPolicy: production
        ? {
            directives: {
              "upgrade-insecure-requests": null,
              "img-src": ["'self'", "blob:"],
              "connect-src": ["'self'"],
            },
          }
        : false,
    }),
  );
  const paths = [
    "/session",
    "/me",
    "/feed",
    "/swipe",
    "/matches",
    "/profile",
    "/location",
    "/photo",
    "/media",
    "/letters",
    "/connections",
    "/encounters",
  ];
  app.use(
    paths,
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a minute." },
    }),
  );
  app.use(paths, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    // JSON/raw API only: custom header + no CORS prevents cross-site form writes.
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (
        req.get("X-Coy-Request") !== "1" ||
        req.get("Sec-Fetch-Site") === "cross-site"
      )
        return res.status(403).json({ error: "Invalid request origin." });
      if (req.get("Origin")) {
        try {
          if (new URL(req.get("Origin")).host !== req.get("Host"))
            return res.status(403).json({ error: "Invalid request origin." });
        } catch {
          return res.status(403).json({ error: "Invalid request origin." });
        }
      }
    }
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("coy_session="))
      ?.slice(12);
    req.userId = store.resolveSession(token);
    next();
  });
  app.post("/session", (req, res) => {
    if (!req.userId) {
      const session = store.createSession();
      req.userId = session.id;
      res.cookie("coy_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        maxAge: 30 * 86400000,
        path: "/",
      });
    }
    res.json({ user: store.me(req.userId) });
  });
  app.use(paths, (req, res, next) =>
    req.userId
      ? next()
      : res.status(401).json({
          error: "Your session expired. Reload to start a new session.",
        }),
  );
  app.use(express.json({ limit: "8kb" }));
  app.get("/me", (req, res) => res.json({ user: store.me(req.userId) }));
  app.get("/feed", (req, res) =>
    res.json({
      profiles: store.feed(req.userId),
    }),
  );
  app.get("/matches", (req, res) =>
    res.json({ matches: store.matches(req.userId) }),
  );
  app.post("/swipe", (req, res) =>
    res.json(store.swipe(req.userId, req.body?.profileId, req.body?.action)),
  );
  app.post("/profile", (req, res) =>
    res.json({ user: store.edit(req.userId, req.body) }),
  );
  app.post("/location", (req, res) =>
    res.json({ user: store.location(req.userId, req.body) }),
  );
  app.post(
    "/photo",
    rateLimit({ windowMs: 60000, limit: 10, legacyHeaders: false }),
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "3mb",
    }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        fail("Upload a JPEG, PNG, or WebP image under 3 MB.");
      let photo;
      try {
        const input = sharp(req.body, {
          limitInputPixels: 20000000,
          animated: false,
        });
        const meta = await input.metadata();
        if (!["jpeg", "png", "webp"].includes(meta.format))
          fail("Unsupported image.");
        photo = await input
          .rotate()
          .resize(800, 1000, { fit: "cover", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        fail("The image could not be read. Use JPEG, PNG, or WebP under 3 MB.");
      }
      // Re-encoding strips EXIF (including GPS), original filenames, and active content.
      res.json({ user: store.photo(req.userId, photo) });
    },
  );
  app.get("/media/:owner", (req, res) => {
    const bytes = store.readPhoto(req.userId, req.params.owner);
    if (!bytes) return res.status(404).json({ error: "Image unavailable." });
    res.type("webp").send(Buffer.from(bytes));
  });
  app.get("/letters/:target", (req, res) =>
    res.json({ letter: store.ownLetter(req.userId, req.params.target) }),
  );
  app.post("/letters/:target", (req, res) =>
    res.json(store.writeLetter(req.userId, req.params.target, req.body?.body)),
  );
  app.get("/connections/:target", (req, res) =>
    res.json(store.connection(req.userId, req.params.target)),
  );
  app.post(
    "/connections/:target/messages",
    rateLimit({
      windowMs: 60000,
      limit: 30,
      legacyHeaders: false,
      message: { error: "Please wait before sending more messages." },
    }),
    (req, res) =>
      res.json(
        store.sendMessage(
          req.userId,
          req.params.target,
          req.body?.body,
          req.body?.requestId,
        ),
      ),
  );
  app.post("/connections/:target/contact", (req, res) =>
    res.json(
      store.shareContact(req.userId, req.params.target, req.body?.phone),
    ),
  );
  app.post("/encounters", (req, res) =>
    res.json(store.createEncounter(req.userId)),
  );
  app.post("/encounters/revoke", (req, res) =>
    res.json(store.revokeEncounter(req.userId)),
  );
  app.post("/encounters/profile", (req, res) =>
    res.json(store.saveProfileEncounter(req.userId, req.body?.profileId)),
  );
  app.get("/encounters/saved", (req, res) =>
    res.json({ encounters: store.savedEncounters(req.userId) }),
  );
  app.post("/encounters/:token/save", (req, res) =>
    res.json(store.saveEncounter(req.userId, req.params.token)),
  );
  app.post("/encounters/saved/:target/like", (req, res) =>
    res.json(store.crushEncounter(req.userId, req.params.target)),
  );
  app.get("/encounters/:token", (req, res) =>
    res.json(store.previewEncounter(req.userId, req.params.token)),
  );
  app.post("/encounters/:token/like", (req, res) =>
    res.json(store.likeEncounter(req.userId, req.params.token)),
  );
  app.use(paths, (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((err, _req, res, _next) =>
    res.status(err.status || 500).json({
      error:
        err.type === "entity.parse.failed"
          ? "Invalid JSON body."
          : err.status === 413
            ? "Upload or request is too large."
            : err.status
              ? err.message
              : "Something went wrong. Please try again.",
    }),
  );
  return app;
}
