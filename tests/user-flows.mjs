import assert from "node:assert/strict";
import sharp from "sharp";

export async function userFlows(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 12.97, longitude: 77.59 },
    permissions: ["geolocation"],
  });
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    const a = await context.newPage(),
      b = await other.newPage();
    const errors = [];
    for (const page of [a, b])
      page.on("pageerror", (e) => errors.push(e.message));
    async function edit(page, name) {
      await page.goto(base);
      await page
        .getByRole("navigation")
        .getByRole("button", { name: /Profile/ })
        .click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("Age", { exact: true }).fill("24");
      await page.getByLabel("City", { exact: true }).fill("Bengaluru");
      await page
        .getByLabel("You, in a nutshell")
        .fill("Long walks, good coffee, and a little curiosity.");
      await page.getByLabel("Interests").fill("Coffee, Books");
      await page.getByLabel("Show my profile in Discover").check();
      await page.getByRole("button", { name: "Avatar 3", exact: true }).click();
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .click();
      await page.getByText("Profile saved.", { exact: true }).waitFor();
    }
    await edit(a, "Alice");
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#ff3d81" },
    })
      .png()
      .toBuffer();
    await a.getByLabel("Upload a photo").setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: image,
    });
    await a
      .getByText("Photo uploaded. Save your other profile changes below.", {
        exact: true,
      })
      .waitFor();
    await a.reload();
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Profile/ })
      .click();
    assert.equal(
      await a.getByLabel("Name", { exact: true }).inputValue(),
      "Alice",
    );
    assert.ok(
      (
        await a
          .getByRole("img", { name: "Your profile", exact: true })
          .getAttribute("src")
      ).startsWith("/media/"),
    );
    await edit(b, "Bob");
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Discover/ })
      .click();
    await a.getByRole("heading", { name: "Bob, 24", exact: true }).waitFor();
    await a.getByRole("button", { name: "Like profile", exact: true }).click();
    await a.getByRole("heading", { name: "Ananya, 23", exact: true }).waitFor();
    assert.equal(await a.getByRole("dialog").count(), 0);
    await b
      .getByRole("navigation")
      .getByRole("button", { name: /Discover/ })
      .click();
    await b.getByRole("heading", { name: "Alice, 24", exact: true }).waitFor();
    await b.getByRole("button", { name: "Like profile", exact: true }).click();
    await b
      .getByRole("heading", { name: "It’s a match!", exact: true })
      .waitFor();
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Matches/ })
      .click();
    await a.getByRole("button", { name: /Bob, 24/ }).waitFor();
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Discover/ })
      .click();
    await a
      .getByRole("button", { name: "Allow location", exact: true })
      .click();
    await a
      .getByText("Using your approximate location", { exact: true })
      .waitFor();
    const feed = await (await a.request.get(base + "/feed")).json();
    assert.ok(
      feed.profiles.length > 0 &&
        feed.profiles.every((p) => p.city === "Bengaluru" && !("lat" in p)),
    );
    await a
      .getByRole("button", {
        name: "Clear location",
        exact: true,
      })
      .click();
    await a
      .getByText("Use location for better suggestions", { exact: true })
      .waitFor();
    await a.getByRole("button", { name: "Use dark mode", exact: true }).click();
    await a.reload();
    assert.equal(await a.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Passed: profile edits, avatars, image upload, two real users matching, location consent/filter/removal, and persistent dark mode.",
    );
  } finally {
    await context.close();
    await other.close();
  }
}
