import { expect, test } from "@playwright/test";
import { USER, login } from "./helpers";

test("rejects a wrong password and keeps the email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(USER.email);
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta-000");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email" })).toHaveText("Email o contraseña incorrectos.");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(USER.email);
});

test("redirects to login when there is no session and returns afterwards", async ({ page }) => {
  await page.goto("/movimientos");
  await expect(page).toHaveURL(/\/login\?next=%2Fmovimientos/);
  await page.getByLabel("Email", { exact: true }).fill(USER.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(USER.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Movimientos", exact: true })).toBeVisible();
});

test("logs out from Mi cuenta", async ({ page }) => {
  await login(page);
  await page.goto("/mas/cuenta");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
