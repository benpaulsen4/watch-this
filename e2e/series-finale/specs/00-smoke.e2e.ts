import { expect, test } from "@playwright/test";

// Confirms the harness itself works: the app serves the auth page and the
// API refuses unauthenticated requests without letting a shared cache keep
// the response. Read-only -- runs in every read-only project.

test("the auth page offers sign-in and registration", async ({ page }) => {
  await page.goto("/auth");

  await expect(
    page.getByRole("heading", { name: "Welcome Back" }),
  ).toBeVisible();

  await page.screenshot({
    path: "e2e/series-finale/artifacts/screenshots/auth/sign-in.png",
  });

  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Account with Passkey" }),
  ).toBeVisible();
});

test("the series finale API refuses an unauthenticated request", async ({
  request,
}) => {
  const response = await request.get("/api/series-finale");

  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});
