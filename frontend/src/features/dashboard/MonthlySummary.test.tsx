import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addMonths, currentMonth } from "@/lib/dates";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { MonthlySummary } from "./MonthlySummary";

const summary = {
  month: "2026-10", income: 3000000, expense: 400000, savings: 500000, balance: 2600000,
  savings_rate: 0.1667,
  expense_by_category: [
    { category_id: "c1", name: "Comida", amount: 300000 },
    { category_id: "c2", name: "Transporte", amount: 100000 },
  ],
  budgets: [
    { category_id: "c1", category_name: "Comida", budget: 350000, spent: 300000, remaining: 50000, percent: 85, level: "warning", committed: 0 },
    { category_id: "c3", category_name: "Ocio", budget: 0, spent: 0, remaining: null, percent: null, level: "none", committed: 0 },
  ],
  pending: { count: 2, income: 0, expense: 95000 },
  accounts: [{ id: "a1", name: "Bancolombia", type: "debit", balance: 5000000 }],
  savings_reminder: true,
};

describe("MonthlySummary", () => {
  it("shows the month figures", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/monthly": () => ({ body: summary }) });
    renderWithClient(<MonthlySummary />);
    const figures = await screen.findByRole("region", { name: "Resumen del mes" });
    expect(within(figures).getByText("$3.000.000")).toBeInTheDocument();
    expect(within(figures).getByText("$400.000")).toBeInTheDocument();
    expect(within(figures).getByText("$500.000")).toBeInTheDocument();
    expect(within(figures).getByText("$2.600.000")).toBeInTheDocument();
    expect(within(figures).getByText("16,7%")).toBeInTheDocument();
    expect(calls[0].url.searchParams.get("month")).toBe(currentMonth());
  });

  it("shows reminder, categories, budgets with limits, pending and balances", async () => {
    mockApi({ "GET /api/dashboard/monthly": () => ({ body: summary }) });
    renderWithClient(<MonthlySummary />);
    expect(await screen.findByText(/aún no apartaste tu ahorro/)).toBeInTheDocument();
    const categories = screen.getByRole("region", { name: "Gasto por categoría" });
    expect(within(categories).getByText("Comida")).toBeInTheDocument();
    const budgets = screen.getByRole("region", { name: "Presupuestos" });
    expect(within(budgets).getByText("Comida: $300.000 de $350.000 (85%)")).toBeInTheDocument();
    expect(within(budgets).queryByText(/Ocio/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 movimientos por confirmar" })).toHaveAttribute("href", "/movimientos");
    expect(within(screen.getByRole("region", { name: "Cuentas" })).getByText("$5.000.000")).toBeInTheDocument();
  });

  it("navigates months", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/monthly": () => ({ body: { ...summary, savings_rate: null } }) });
    renderWithClient(<MonthlySummary />);
    expect(await screen.findByText("—")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await waitFor(() =>
      expect(calls.at(-1)!.url.searchParams.get("month")).toBe(addMonths(currentMonth(), -1)),
    );
  });
});
