import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import type { Transaction } from "./api";
import { SaveFeedback } from "./SaveFeedback";

const transaction: Transaction = {
  id: "t1", type: "income", amount: 3000000, date: "2026-10-01", account_id: "a1",
  to_account_id: null, category_id: "c2", description: null, status: "confirmed",
  source: "manual", created_at: "2026-10-01T12:00:00Z", recurring_template_id: null,
};

describe("SaveFeedback", () => {
  it("warns when a budget is close to its limit", () => {
    renderWithClient(
      <SaveFeedback
        result={{
          transaction: { ...transaction, type: "expense" },
          budget_status: {
            category_id: "c1", category_name: "Comida", budget: 100000, spent: 85000,
            remaining: 15000, percent: 85, level: "warning", committed: 0,
          },
          savings_suggestion: null,
        }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Movimiento guardado");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Llevas 85% del presupuesto de Comida ($85.000 de $100.000).",
    );
  });

  it("tells when the budget is exceeded", () => {
    renderWithClient(
      <SaveFeedback
        result={{
          transaction: { ...transaction, type: "expense" },
          budget_status: {
            category_id: "c1", category_name: "Comida", budget: 100000, spent: 120000,
            remaining: -20000, percent: 120, level: "exceeded", committed: 0,
          },
          savings_suggestion: null,
        }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Te pasaste del presupuesto de Comida: $120.000 de $100.000.",
    );
  });

  it("creates the savings transfer when accepted, with the edited amount", async () => {
    const { calls } = mockApi({
      "POST /api/transactions": () => ({
        status: 201,
        body: { transaction: { ...transaction, id: "t2", type: "transfer" }, budget_status: null, savings_suggestion: null },
      }),
    });
    renderWithClient(
      <SaveFeedback
        result={{
          transaction,
          budget_status: null,
          savings_suggestion: { amount: 600000, from_account_id: "a1", to_account_id: "a9", date: "2026-10-01" },
        }}
        onDone={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Monto a apartar");
    expect(amount).toHaveValue("600.000");
    await userEvent.clear(amount);
    await userEvent.type(amount, "500.000");
    await userEvent.click(screen.getByRole("button", { name: "Apartar" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      type: "transfer", amount: 500000, date: "2026-10-01",
      account_id: "a1", to_account_id: "a9", source: "savings_rule",
    });
    expect(await screen.findByText("Listo, apartaste $500.000.")).toBeInTheDocument();
  });

  it("can dismiss the suggestion and finish", async () => {
    const onDone = vi.fn();
    renderWithClient(
      <SaveFeedback
        result={{
          transaction,
          budget_status: null,
          savings_suggestion: { amount: 600000, from_account_id: "a1", to_account_id: "a9", date: "2026-10-01" },
        }}
        onDone={onDone}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByLabelText("Monto a apartar")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onDone).toHaveBeenCalled();
  });
});
