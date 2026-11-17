import assert from "node:assert/strict";

export async function encounterFlow(browser, base) {
  const ca = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    cb = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const a = await ca.newPage(),
      b = await cb.newPage();
    async function publish(page, name) {
      await page.goto(base);
      await page
        .getByRole("navigation")
        .getByRole("button", { name: /Profile/ })
        .click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("Age", { exact: true }).fill("25");
      await page.getByLabel("City", { exact: true }).fill("Pune");
      await page
        .getByLabel("You, in a nutshell")
        .fill("A little curiosity and good conversation.");
      await page.getByLabel("Show my profile in Discover").check();
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .click();
      await page.getByText("Profile saved.", { exact: true }).waitFor();
    }
    await publish(a, "Aria");
    await publish(b, "Ben");
    // Compose before either user likes the other.
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Discover/ })
      .click();
    await a.locator(".identity h2").waitFor();
    while ((await a.locator(".identity h2").innerText()) !== "Ben, 25") {
      const name = await a.locator(".identity h2").innerText();
      await a
        .getByRole("button", { name: "Pass on profile", exact: true })
        .click();
      await a.waitForFunction(
        (previous) =>
          document.querySelector(".identity h2")?.textContent !== previous,
        name,
      );
    }
    await a.getByRole("heading", { name: "Ben, 25", exact: true }).waitFor();
    assert.equal(await a.locator(".photo-label").count(), 0);
    await a.getByRole("button", { name: /Write an Unsent letter/ }).click();
    await a
      .getByLabel("Your letter")
      .fill("I kept thinking about that conversation.");
    await a.getByRole("button", { name: "Save letter", exact: true }).click();
    await a
      .getByText("Letter saved. It opens only when you both like each other.", {
        exact: true,
      })
      .waitFor();
    await a.getByRole("button", { name: "Close letter" }).click();
    async function card(page) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: /Encounter/ })
        .click();
      await page
        .getByRole("button", { name: "Create my encounter card", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector(".encounter-card canvas")?.width > 100,
      );
      assert.equal(
        await page.getByText("Copy link", { exact: true }).count(),
        0,
      );
      assert.equal(await page.getByLabel("Their encounter link").count(), 0);
      return page.locator(".encounter-card canvas").screenshot();
    }
    const qrA = await card(a),
      qrB = await card(b);
    // Permission denial offers image scanning without sending camera data.
    await b.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Denied", "NotAllowedError");
      };
    });
    await b.getByRole("button", { name: "Scan QR code", exact: true }).click();
    await b
      .getByText(
        "Camera permission was denied. Allow it in your browser or scan a QR image.",
        { exact: true },
      )
      .waitFor();
    await b.getByRole("button", { name: "Stop scanning", exact: true }).click();
    await b.getByLabel("Or scan a QR image").setInputFiles({
      name: "encounter.png",
      mimeType: "image/png",
      buffer: qrA,
    });
    await b
      .getByRole("button", { name: "Add as a crush ♡", exact: true })
      .click();
    await b
      .getByText(
        "Your interest is saved. They’ll only know if they like you too.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await b
        .getByText("I kept thinking about that conversation.", { exact: true })
        .count(),
      0,
    );
    // Feed an actual generated QR through a deterministic camera MediaStream.
    await a.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      const draw = () => {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 480, 480);
        ctx.drawImage(bitmap, 40, 40, 400, 400);
      };
      draw();
      navigator.mediaDevices.getUserMedia = async () => {
        window.qrTestStream = canvas.captureStream(5);
        window.qrTestTimer = setInterval(draw, 150);
        return window.qrTestStream;
      };
    }, Array.from(qrB));
    await a.getByRole("button", { name: "Scan QR code", exact: true }).click();
    await a
      .getByRole("button", { name: "Add as a crush ♡", exact: true })
      .waitFor();
    assert.equal(
      await a.evaluate(() =>
        window.qrTestStream.getTracks().every((t) => t.readyState === "ended"),
      ),
      true,
    );
    await a.evaluate(() => clearInterval(window.qrTestTimer));
    await a
      .getByRole("button", { name: "Add as a crush ♡", exact: true })
      .click();
    await a
      .getByRole("heading", { name: "It’s a match!", exact: true })
      .waitFor();
    await a.getByRole("button", { name: "Say hi", exact: true }).click();
    await a.getByRole("heading", { name: "Say hi", exact: true }).waitFor();
    await a.getByLabel("Message", { exact: true }).fill("Hi Ben!");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await a.getByText("Hi Ben!", { exact: true }).waitFor();
    await b
      .getByRole("navigation")
      .getByRole("button", { name: /Discover/ })
      .click();
    await b
      .getByRole("button", { name: "Say hi to Aria", exact: true })
      .click();
    await b
      .getByText("I kept thinking about that conversation.", { exact: true })
      .waitFor();
    await b.getByText("Hi Ben!", { exact: true }).waitFor();
    await a.getByText("Ready to exchange numbers?", { exact: true }).click();
    await a
      .getByLabel("Your phone number", { exact: true })
      .fill("+919876543210");
    await a
      .getByRole("button", { name: "Share with this match", exact: true })
      .click();
    await a
      .getByText("Your number is shared with this match only.", { exact: true })
      .waitFor();
    await b.getByText("Ready to exchange numbers?", { exact: true }).click();
    await b
      .getByRole("link", { name: "+919876543210", exact: true })
      .waitFor({ timeout: 15000 });
    await a
      .getByRole("button", { name: "Stop sharing my number", exact: true })
      .click();
    await a
      .getByText("Your number is no longer shown.", { exact: true })
      .waitFor();
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Encounter/ })
      .click();
    await a
      .getByRole("button", { name: "Create my encounter card", exact: true })
      .click();
    await a.getByLabel("My Encounter QR code", { exact: true }).waitFor();
    await a.getByRole("button", { name: "Revoke card", exact: true }).click();
    await a
      .getByText("Your previous card is no longer valid.", { exact: true })
      .waitFor();
    console.log(
      "Passed: private letter before match, QR generation, camera decoding/cleanup, image scanning, permission denial, mutual unlock, Say hi chat, and explicit number sharing/revocation.",
    );
  } finally {
    await ca.close();
    await cb.close();
  }
}
