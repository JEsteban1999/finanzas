import { expect, test } from "@playwright/test";
import { createAccount, login, unique } from "./helpers";

test("interprets free text with the fake parser and saves after confirmation", async ({ page }) => {
  await login(page);
  const account = unique("Debito texto");
  await createAccount(page, account);
  await page.goto("/registrar");
  await page.getByLabel("Cuéntame el movimiento", { exact: true }).fill(`almorcé 35 mil comida con ${account.toLowerCase()}`);
  await page.getByRole("button", { name: "Interpretar", exact: true }).click();
  await expect(page.getByLabel("Monto", { exact: true })).toHaveValue("35.000");
  await expect(page.getByRole("combobox", { name: "Categoría", exact: true }).locator("option:checked")).toHaveText("Comida");
  await expect(page.getByRole("combobox", { name: "Cuenta", exact: true }).locator("option:checked")).toHaveText(account);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Movimiento guardado");
});
