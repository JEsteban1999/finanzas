import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { todayISO } from "@/lib/dates";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { RecurringManager } from "./RecurringManager";

const accounts = [{ id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 }];
const categories = [{ id: "c1", name: "Vivienda", kind: "expense", archived: false }];
const template = {
  id: "r1", type: "expense", amount: 1200000, account_id: "a1", to_account_id: null, category_id: "c1",
  description: "Arriendo", day_of_month: 5, start_date: "2026-10-01", end_date: null,
  next_run_date: "2026-11-05", active: true,
};

function setup(extra = {}) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/recurring": () => ({ body: [template] }),
    ...extra,
  });
}

describe("RecurringManager", () => {
  it("lists templates", async () => {
    setup();
    renderWithClient(<RecurringManager />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    expect(within(row).getByText("-$1.200.000")).toBeInTheDocument();
    expect(within(row).getByText("Día 5 de cada mes · Próximo: 5 nov")).toBeInTheDocument();
  });

  it("pauses and deletes", async () => {
    const { calls } = setup({
      "PATCH /api/recurring/r1": () => ({ body: { ...template, active: false } }),
      "DELETE /api/recurring/r1": () => ({ status: 204 }),
    });
    renderWithClient(<RecurringManager />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ active: false }));
    await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("creates a template", async () => {
    const { calls } = setup({ "POST /api/recurring": () => ({ status: 201, body: template }) });
    renderWithClient(<RecurringManager />);
    const form = await screen.findByRole("form", { name: "Nueva plantilla" });
    await userEvent.type(within(form).getByLabelText("Monto"), "1.200.000");
    await userEvent.selectOptions(within(form).getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(within(form).getByLabelText("Categoría"), "c1");
    await userEvent.type(within(form).getByLabelText("Descripción"), "Arriendo");
    await userEvent.clear(within(form).getByLabelText("Día del mes"));
    await userEvent.type(within(form).getByLabelText("Día del mes"), "5");
    expect(within(form).getByLabelText("Desde")).toHaveValue(todayISO());
    await userEvent.click(within(form).getByRole("button", { name: "Agregar plantilla" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")!.body).toEqual({
        type: "expense", amount: 1200000, account_id: "a1", to_account_id: null, category_id: "c1",
        description: "Arriendo", day_of_month: 5, start_date: todayISO(), end_date: null,
      }),
    );
  });

  it("shows server errors and keeps the form", async () => {
    setup({ "POST /api/recurring": () => apiError(422, "START_DATE_TOO_OLD") });
    renderWithClient(<RecurringManager />);
    const form = await screen.findByRole("form", { name: "Nueva plantilla" });
    await userEvent.type(within(form).getByLabelText("Monto"), "1000");
    await userEvent.selectOptions(within(form).getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(within(form).getByLabelText("Categoría"), "c1");
    await userEvent.click(within(form).getByRole("button", { name: "Agregar plantilla" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("más de un año");
    expect(within(form).getByLabelText("Monto")).toHaveValue("1000");
  });
});
