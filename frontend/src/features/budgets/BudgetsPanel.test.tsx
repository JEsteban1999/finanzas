import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { currentMonth } from "@/lib/dates";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { BudgetsPanel } from "./BudgetsPanel";

const items = [
  { category_id: "c1", category_name: "Comida", budget: 100000, spent: 85000, remaining: 15000, percent: 85, level: "warning", committed: 40000 },
  { category_id: "c2", category_name: "Ocio", budget: 0, spent: 20000, remaining: null, percent: null, level: "none", committed: 0 },
];

function setup() {
  return mockApi({
    "GET /api/budgets/status": () => ({ body: { month: currentMonth(), items } }),
    "PUT /api/budgets": ({ body }) => ({ body }),
  });
}

describe("BudgetsPanel", () => {
  it("shows the status of each category", async () => {
    setup();
    renderWithClient(<BudgetsPanel />);
    const comida = (await screen.findByText("Comida")).closest("li")!;
    expect(within(comida).getByText("$85.000 de $100.000")).toBeInTheDocument();
    expect(within(comida).getByText("Cerca del límite")).toBeInTheDocument();
    expect(within(comida).getByText("Comprometido: $40.000")).toBeInTheDocument();
    const ocio = screen.getByText("Ocio").closest("li")!;
    expect(within(ocio).getByText("Sin presupuesto")).toBeInTheDocument();
    expect(within(ocio).getByText("Gastado: $20.000")).toBeInTheDocument();
  });

  it("saves a budget for the selected month", async () => {
    const { calls } = setup();
    renderWithClient(<BudgetsPanel />);
    const input = await screen.findByLabelText("Presupuesto de Ocio");
    await userEvent.type(input, "150.000");
    await userEvent.click(within(input.closest("li")!).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
        category_id: "c2", month: currentMonth(), amount: 150000,
      }),
    );
  });

  it("removes a budget with 0 and rejects invalid amounts", async () => {
    const { calls } = setup();
    renderWithClient(<BudgetsPanel />);
    const input = await screen.findByLabelText("Presupuesto de Comida");
    expect(input).toHaveValue("100.000");
    await userEvent.clear(input);
    await userEvent.type(input, "1,5");
    const row = input.closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("Usa solo pesos enteros");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ amount: 0 }));
  });
});
