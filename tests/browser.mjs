import { encounterFlow } from "./encounter-flow.mjs";
import { userFlows } from "./user-flows.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
// Run against an isolated database: never consume the user's demo feed.
const dir = mkdtempSync(join(tmpdir(), "coy-browser-"));
const server = spawn(process.execPath, ["server/index.js", "--production"], {
  env: {
    ...process.env,
    PORT: "3099",
    DATA_FILE: join(dir, "test.sqlite"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Server startup timeout")),
      15000,
    );
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Coy is ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("error", reject);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Server exited: ${code}`));
    });
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3099");
  await page
    .getByRole("heading", { name: "Ananya, 23", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Use dark mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: /Home/ }).click();
  assert.equal(await page.locator("section, article, form").count(), 0);
  await nav.getByRole("button", { name: /Discover/ }).click();
  await page.getByRole("button", { name: "Like profile", exact: true }).click();
  await page.getByRole("heading", { name: "It’s a match!" }).waitFor();
  await page.getByRole("button", { name: "See matches", exact: true }).click();
  await page.getByRole("button", { name: /WhatsApp for/ }).waitFor();
  await nav.getByRole("button", { name: /Discover/ }).click();
  await page.getByRole("heading", { name: "Rohan, 24", exact: true }).waitFor();
  // Actual touch drag exercises the mobile gesture path.
  await page.locator("article").scrollIntoViewIfNeeded();
  const box = await page.locator("article").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width * 0.7,
    y = box.y + 140;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - i * 18, y }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.getByRole("heading", { name: "Meera, 22", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Meera, 22", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("button", { name: "Pass on profile", exact: true })
    .click();
  await page.getByRole("heading", { name: "Arjun, 25", exact: true }).waitFor();
  const feed = await (
    await page.request.get("http://localhost:3099/feed")
  ).json();
  for (const p of feed.profiles)
    await page.request.post("http://localhost:3099/swipe", {
      headers: { "X-Coy-Request": "1" },
      data: { profileId: p.id, action: "pass" },
    });
  await page.reload();
  await page.getByRole("heading", { name: "You're all caught up." }).waitFor();
  await nav.getByRole("button", { name: /Matches/ }).click();
  await page.getByRole("button", { name: /WhatsApp for/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Passed: blank Home, mobile drag, desktop buttons, mutual-match reveal, reload persistence, Matches and exhausted feed.",
  );
  await userFlows(browser, "http://localhost:3099");
  await encounterFlow(browser, "http://localhost:3099");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) =>
    server.exitCode !== null ? r() : server.once("exit", r),
  );
  rmSync(dir, { recursive: true, force: true });
}
