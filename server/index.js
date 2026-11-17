import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import express from "express";
const root = fileURLToPath(new URL("../", import.meta.url));
const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
const store = createStore(
  process.env.DATA_FILE || resolve(root, "data/coy.sqlite"),
  {
    encounterMinutes: Number(process.env.ENCOUNTER_MINUTES || 30),
  },
);
const app = createApp(store, {
  production,
  secureCookies: process.env.COOKIE_SECURE === "true",
});
let vite;
if (production) {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
} else {
  vite = await (
    await import("vite")
  ).createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Coy is ready at http://localhost:${port}`),
);
async function close() {
  server.close();
  await vite?.close();
  store.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
