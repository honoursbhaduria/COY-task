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
        .getByRole("button", { name: /Profile/ })
        .click();
      await page
        .getByRole("button", { name: "Generate my QR", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector(".profile-qr-dialog canvas")?.width > 100,
      );
      const image = await page
        .locator(".profile-qr-dialog canvas")
        .screenshot();
      await page.getByRole("button", { name: "Close QR", exact: true }).click();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: /Encounter/ })
        .click();
      return image;
    }
    const qrA = await card(a),
      qrB = await card(b);
    // Permission denial offers image scanning without sending camera data.
    async function scan(page, qr) {
      await page.evaluate(async (bytes) => {
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
      }, Array.from(qr));
      await page
        .getByRole("button", { name: "Scan QR code", exact: true })
        .click();
      await page
        .getByText(
          "Added to your encounters. Decide later if you feel a spark.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page.evaluate(() =>
          window.qrTestStream
            .getTracks()
            .every((t) => t.readyState === "ended"),
        ),
        true,
      );
      await page.evaluate(() => clearInterval(window.qrTestTimer));
      assert.equal(await page.locator("input[type=file]").count(), 0);
    }
    await scan(b, qrA);
    await b
      .getByRole("button", { name: "Add as a crush ♡", exact: true })
      .click();
    await b
      .getByText(
        "Your interest is saved. They’ll only know if they like you too.",
        { exact: true },
      )
      .waitFor();
    await scan(a, qrB);
    await a
      .getByRole("button", { name: "Add as a crush ♡", exact: true })
      .click();
    await a
      .getByRole("heading", { name: "It’s a match!", exact: true })
      .waitFor();
    await a.getByRole("button", { name: "See matches", exact: true }).click();
    const whatsapp = a.getByRole("button", {
      name: "WhatsApp for Ben",
      exact: true,
    });
    await whatsapp.waitFor();
    const url = a.url();
    await whatsapp.click();
    assert.equal(a.url(), url);
    assert.equal(await a.locator(".contact-sharing").count(), 0);
    assert.equal(await whatsapp.innerText(), "Say hi");
    await a
      .getByRole("navigation")
      .getByRole("button", { name: /Discover/ })
      .click();
    assert.equal(await a.getByRole("button", { name: /Say hi/ }).count(), 0);
    await b.reload();
    await b
      .getByRole("navigation")
      .getByRole("button", { name: /Encounter/ })
      .click();
    await b.getByRole("heading", { name: "Aria, 25", exact: true }).waitFor();
    console.log(
      "Passed: camera QR exchange, saved encounters across reloads, mutual crush matching, and inert WhatsApp icon button.",
    );
  } finally {
    await ca.close();
    await cb.close();
  }
}
