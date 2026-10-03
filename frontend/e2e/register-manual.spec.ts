import { expect, test } from "@playwright/test";
import { createAccount, login, unique } from "./helpers";

test("registers an expense manually and sees it in the list", async ({ page }) => {
  await login(page);
  const account = unique("Débito manual");
  await createAccount(page, account);
  await page.getByRole("link", { name: "Registrar", exact: true }).click();
  await page.getByRole("button", { name: "Registrar a mano", exact: true }).click();
  await page.getByLabel("Monto", { exact: true }).fill("35.000");
  await page.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: account });
  await page.getByRole("combobox", { name: "Categoría", exact: true }).selectOption({ label: "Comida" });
  await page.getByLabel("Descripción", { exact: true }).fill("Almuerzo e2e");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Movimiento guardado");
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("link", { name: "Movimientos", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Almuerzo e2e" });
  await expect(row).toContainText("-$35.000");
});
