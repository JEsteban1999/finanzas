import { expect, test } from "@playwright/test";
import { bogotaDay, createAccount, login, unique } from "./helpers";

test("a recurring template generates a pending movement that can be confirmed", async ({ page, request }) => {
  await login(page);
  const account = unique("Débito arriendo");
  const description = unique("Arriendo");
  await createAccount(page, account);

  await page.goto("/mas/recurrentes");
  const form = page.getByRole("form", { name: "Nueva plantilla" });
  await form.getByLabel("Monto", { exact: true }).fill("1.200.000");
  await form.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: account });
  await form.getByRole("combobox", { name: "Categoría", exact: true }).selectOption({ label: "Vivienda" });
  await form.getByLabel("Descripción", { exact: true }).fill(description);
  await form.getByLabel("Día del mes", { exact: true }).fill(String(bogotaDay()));
  await form.getByRole("button", { name: "Agregar plantilla", exact: true }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  const job = await request.post("http://localhost:8010/internal/jobs/recurring", {
    headers: { Authorization: "Bearer e2e-cron-token" },
  });
  expect(job.ok()).toBeTruthy();
  expect((await job.json()).created).toBeGreaterThanOrEqual(1);

  await page.goto("/movimientos");
  const row = page.getByRole("listitem").filter({ hasText: description });
  await row.getByRole("button", { name: "Confirmar", exact: true }).click();
  await row.getByRole("button", { name: "Confirmar movimiento", exact: true }).click();
  await expect(page.getByRole("status").first()).toHaveText("Movimiento guardado");
});
