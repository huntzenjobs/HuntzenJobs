import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/jobs",
  "/salons",
] as const;

const routeUrl = (route: string) => {
  const overrideBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
  return overrideBaseUrl ? new URL(route, overrideBaseUrl).toString() : route;
};

const chromeOutsideMainRoutes = [
  "/login",
  "/signup",
  "/pricing",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
] as const;

test.describe("structure des pages publiques", () => {
  for (const route of publicRoutes) {
    test(`${route} expose un contenu principal unique`, async ({ page }) => {
      await page.goto(routeUrl(route));

      await expect(page.locator("main, [role='main']")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }

  for (const route of chromeOutsideMainRoutes) {
    test(`${route} garde la navigation globale hors du contenu principal`, async ({
      page,
    }) => {
      await page.goto(routeUrl(route));

      await expect(page.locator("main > header, main > footer")).toHaveCount(0);
    });
  }

  test("la page contact annonce un titre propre", async ({ page }) => {
    await page.goto(routeUrl("/contact"));

    await expect(page).toHaveTitle(/contact/i);
  });

  test("le bouton support des tarifs ouvre le contact", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("huntzen_cookie_consent", "declined");
    });
    await page.goto(routeUrl("/pricing"));

    await page.getByRole("link", { name: /support/i }).click();
    await expect(page).toHaveURL(/\/contact$/);
  });

  test("les appels à l’action des tarifs ne doublent pas les contrôles clavier", async ({
    page,
  }) => {
    await page.goto(routeUrl("/pricing"));

    await expect(page.locator("a button, button a")).toHaveCount(0);
  });

  test("le choix de facturation expose son état aux technologies d’assistance", async ({
    page,
  }) => {
    await page.goto(routeUrl("/pricing"));

    const billingSwitch = page.getByRole("switch");
    await expect(billingSwitch).toHaveAttribute("aria-checked", "false");
    await billingSwitch.click();
    await expect(billingSwitch).toHaveAttribute("aria-checked", "true");
  });

  test("les traductions enrichies ne produisent pas d’erreur de formatage", async ({
    page,
  }) => {
    const formattingErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("FORMATTING_ERROR")) {
        formattingErrors.push(message.text());
      }
    });

    for (const route of ["/contact", "/privacy", "/terms"] as const) {
      await page.goto(routeUrl(route), { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      await page.waitForTimeout(250);
    }

    expect(formattingErrors).toEqual([]);
  });
});

test.describe("utilisation mobile des pages publiques", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("les commandes principales mesurées restent tactiles", async ({
    page,
  }) => {
    const targets = [
      { route: "/login", selector: "a[href='/forgot-password']" },
      { route: "/pricing", selector: "button[role='switch']" },
      { route: "/contact", selector: "#name" },
      { route: "/contact", selector: "#email" },
      { route: "/contact", selector: "#reason" },
      { route: "/contact", selector: "button[type='submit']" },
      { route: "/contact", selector: "a[aria-label='LinkedIn']" },
      { route: "/contact", selector: "a[aria-label='Instagram']" },
    ] as const;

    for (const target of targets) {
      await page.goto(routeUrl(target.route));
      const control = page.locator(target.selector).last();
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `${target.route} ${target.selector}`).not.toBeNull();
      expect(
        Math.round(box!.height),
        `${target.route} ${target.selector}`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        Math.round(box!.width),
        `${target.route} ${target.selector}`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  for (const route of publicRoutes) {
    test(`${route} ne déborde pas horizontalement`, async ({ page }) => {
      await page.goto(routeUrl(route));

      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - window.innerWidth,
            ),
          { timeout: 3_000 },
        )
        .toBeLessThanOrEqual(0);
    });
  }
});
