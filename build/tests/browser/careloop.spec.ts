import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { parseEnv } from "node:util";
const env = parseEnv(fs.readFileSync(".env", "utf8"));
test("public landing and mobile Urdu registration layout", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your health story/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create your care space" }).click();
  await expect(
    page.getByRole("heading", { name: "A little clarity, together." }),
  ).toBeVisible();
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + "/careloop-onboarding.png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "اردو", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + "/careloop-register-urdu.png",
      fullPage: true,
    });
});
test("patient pages, report, chart, mobile RTL and clinic review", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signed = await context.request.post("/api/auth/login", {
    headers: { "X-CareLoop-Client": "web" },
    data: { email: "sarah@example.test", password: env.SEED_PASSWORD },
  });
  expect(signed.status()).toBe(200);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
  await page.getByRole("link", { name: "My reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My reports", exact: true }),
  ).toBeVisible();
  await page
    .locator(".cl-report-tile")
    .filter({ hasText: "Synthetic wellness panel" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your results, clearly" }),
  ).toBeVisible();
  await expect(page.locator(".cl-result")).toHaveCount(4);
  await page.getByLabel("Your question").fill("do I have diabetes?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".cl-chat-assistant").last()).toContainText(
    "cannot diagnose",
  );
  await page.getByRole("link", { name: "Trends", exact: true }).click();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await page.getByRole("link", { name: "Medications", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your medication list" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reminders", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Follow-up appointments" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "اردو", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "اگلی ملاقاتیں" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + "/careloop-mobile-urdu.png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + "/careloop-dashboard.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const staff = await context.request.post("/api/auth/login", {
    headers: { "X-CareLoop-Client": "web" },
    data: { email: "clinic@example.test", password: env.SEED_PASSWORD },
  });
  expect(staff.status()).toBe(200);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Clinic review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Clinic review queue" }),
  ).toBeVisible();
  await expect(page.locator(".cl-review").first()).toBeVisible();
  expect(errors).toEqual([]);
});
