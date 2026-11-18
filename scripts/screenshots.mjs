import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "coy-screens-"));
const server = spawn(process.execPath, ["server/index.js", "--production"], {
  env: { ...process.env, PORT: "3101", DATA_FILE: join(dir, "db.sqlite") },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Coy is ready")) resolve();
    });
    server.on("error", reject);
    server.on("exit", (c) => reject(Error("Server exit " + c)));
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto("http://localhost:3101");
  await p.getByRole("button", { name: "Like profile", exact: true }).waitFor();
  mkdirSync("docs/screenshots", { recursive: true });
  const snap = async (name) => {
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({
      path: `docs/screenshots/${name}.png`,
      fullPage: true,
    });
  };
  const tab = async (name) => {
    await p
      .getByRole("navigation")
      .getByRole("button", { name: new RegExp(name) })
      .click();
  };
  await p.getByRole("button", { name: "Not now", exact: true }).click();
  await snap("discover");
  await p.getByRole("button", { name: /Write an Unsent letter/ }).click();
  await p
    .getByLabel("Your letter")
    .fill(
      "I love how you notice the little things. I’d like to get to know you better.",
    );
  await snap("unsent");
  await p.getByRole("button", { name: "Save letter", exact: true }).click();
  await p.getByRole("button", { name: "Close letter" }).click();
  await p.getByRole("button", { name: "Like profile", exact: true }).click();
  await p.getByRole("heading", { name: "It’s a match!" }).waitFor();
  await snap("match");
  await p.getByRole("button", { name: "See matches", exact: true }).click();
  await snap("matches");
  await tab("Home");
  await snap("home");
  await tab("Profile");
  await p.getByLabel("Name", { exact: true }).fill("Aarohi");
  await p.getByLabel("Age", { exact: true }).fill("24");
  await p.getByLabel("City", { exact: true }).fill("Bengaluru");
  await p
    .getByLabel("You, in a nutshell")
    .fill("Bookshops, strong coffee, and spontaneous weekend walks.");
  await p.getByLabel("Interests").fill("Books, Coffee, Hiking");
  await p.getByLabel("Show my profile in Discover").check();
  await p.getByRole("button", { name: "Save profile", exact: true }).click();
  await p.getByText("Profile saved.", { exact: true }).waitFor();
  await snap("profile");
  await p.getByRole("button", { name: "Generate my QR", exact: true }).click();
  await p.waitForFunction(
    () => document.querySelector(".profile-qr-dialog canvas")?.width > 100,
  );
  await snap("profile-qr");
  await p.getByRole("button", { name: "Close QR" }).click();
  const r = await p.request.post("http://localhost:3101/session", {
    headers: { "X-Coy-Request": "1" },
  });
  const owner = (await r.json()).user;
  const other = await browser.newContext();
  const q = await other.newPage();
  await q.goto("http://localhost:3101");
  await q.getByRole("button", { name: "Like profile", exact: true }).waitFor();
  await q.request.post("http://localhost:3101/profile", {
    headers: { "X-Coy-Request": "1" },
    data: {
      name: "Kabir",
      age: 25,
      bio: "Finding new trails and old records.",
      city: "Bengaluru",
      college: "",
      interests: ["Music", "Hiking"],
      published: true,
    },
  });
  const otherUser = (
    await (await q.request.get("http://localhost:3101/me")).json()
  ).user;
  await p.request.post("http://localhost:3101/encounters/profile", {
    headers: { "X-Coy-Request": "1" },
    data: { profileId: otherUser.id },
  });
  await tab("Encounter");
  await p.getByRole("heading", { name: "Kabir, 25", exact: true }).waitFor();
  await snap("encounters");
  await p.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await p.getByRole("button", { name: "Scan QR code", exact: true }).click();
  await p.getByRole("button", { name: "Stop scanning" }).waitFor();
  await snap("scanner");
  await p.getByRole("button", { name: "Stop scanning" }).click();
  await tab("Discover");
  await p.getByRole("button", { name: "Use dark mode" }).click();
  await snap("dark-mode");
  await p.getByRole("button", { name: "Use light mode" }).click();
  const feed = (
    await (await p.request.get("http://localhost:3101/feed")).json()
  ).profiles;
  for (const profile of feed)
    await p.request.post("http://localhost:3101/swipe", {
      headers: { "X-Coy-Request": "1" },
      data: { profileId: profile.id, action: "pass" },
    });
  await p.reload();
  await p.getByRole("heading", { name: "You're all caught up." }).waitFor();
  await snap("empty-state");
  await other.close();
  console.log("Captured 11 feature screenshots with isolated sample data.");
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) =>
    server.exitCode !== null ? r() : server.once("exit", r),
  );
  rmSync(dir, { recursive: true, force: true });
}
