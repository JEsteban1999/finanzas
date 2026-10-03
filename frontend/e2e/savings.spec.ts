import { expect, test } from "@playwright/test";
import { createAccount, login, unique } from "./helpers";

test("salary income suggests saving and creates the transfer", async ({ page }) => {
  await login(page);
  const debit = unique("Nómina");
  const savings = unique("Ahorro");
  await createAccount(page, debit);
  await createAccount(page, savings, "Ahorro");

  await page.goto("/mas/ahorro");
  await page.getByRole("combobox", { name: "Modo", exact: true }).selectOption("percent");
  await page.getByLabel("Valor", { exact: true }).fill("10");
  await page.getByRole("combobox", { name: "Cuando entre dinero en", exact: true }).selectOption({ label: "Salario" });
  await page.getByRole("combobox", { name: "Apartar en la cuenta", exact: true }).selectOption({ label: savings });
  await page.getByRole("button", { name: "Guardar regla", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Regla guardada");

  await page.goto("/registrar");
  await page.getByRole("button", { name: "Registrar a mano", exact: true }).click();
  await page.getByRole("radio", { name: "Ingreso", exact: true }).check();
  await page.getByLabel("Monto", { exact: true }).fill("3.000.000");
  await page.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: debit });
  await page.getByRole("combobox", { name: "Categoría", exact: true }).selectOption({ label: "Salario" });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("¿apartas $300.000 para tu ahorro?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Apartar", exact: true }).click();
  await expect(page.getByText("Listo, apartaste $300.000.")).toBeVisible();
});
