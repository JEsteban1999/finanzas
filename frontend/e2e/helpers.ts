import { expect, type Page } from "@playwright/test";

export const USER = { email: "e2e@example.com", password: "clave-segura-e2e" };

export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

export function bogotaDay(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", day: "2-digit" }).format(new Date()));
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(USER.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(USER.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
}

export async function createAccount(page: Page, name: string, typeLabel = "Débito") {
  await page.goto("/mas/cuentas");
  await page.getByLabel("Nombre de la cuenta", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption({ label: typeLabel });
  await page.getByRole("button", { name: "Agregar cuenta", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}
