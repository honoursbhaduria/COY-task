import { createApp } from "../server/app.js";
import { createStore } from "../server/postgres/store.js";
let ready;
export default async function handler(req, res) {
  if (!process.env.DATABASE_URL)
    return res
      .status(503)
      .json({ error: "Persistent database has not been configured." });
  ready ||= createStore(process.env.DATABASE_URL)
    .then((store) =>
      createApp(store, { production: true, secureCookies: true }),
    )
    .catch((error) => {
      ready = undefined;
      console.error(
        "Database initialization failed:",
        error.code || error.name,
      );
      throw error;
    });
  try {
    const app = await ready;
    return app(req, res);
  } catch {
    return res.status(503).json({
      error: "The database is temporarily unavailable. Please try again.",
    });
  }
}
