import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { PendingList } from "./PendingList";

const accounts = [{ id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 }];
const categories = [{ id: "c1", name: "Vivienda", kind: "expense", archived: false }];
const pending = {
  id: "p1", type: "expense", amount: 1200000, date: "2026-10-15", account_id: "a1",
  to_account_id: null, category_id: "c1", description: "Arriendo", status: "pending",
  source: "recurring", created_at: "2026-10-15T11:00:00Z", recurring_template_id: "r1",
};

function setup(items: unknown[], extra = {}) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/transactions": () => ({ body: { items, next_cursor: null } }),
    ...extra,
  });
}

describe("PendingList", () => {
  it("renders nothing without pending movements", async () => {
    const { calls } = setup([]);
    renderWithClient(<PendingList />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/transactions")).toBe(true));
    expect(screen.queryByRole("heading", { name: "Por confirmar" })).not.toBeInTheDocument();
  });

  it("confirms a pending movement with edits", async () => {
    const { calls } = setup([pending], {
      "POST /api/transactions/p1/confirm": () => ({
        body: { transaction: { ...pending, status: "confirmed", amount: 1250000 }, budget_status: null, savings_suggestion: null },
      }),
    });
    renderWithClient(<PendingList />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    expect(calls.find((c) => c.path === "/api/transactions")!.url.searchParams.get("status")).toBe("pending");
    await userEvent.click(within(row).getByRole("button", { name: "Confirmar" }));
    const amount = within(row).getByLabelText("Monto");
    expect(amount).toHaveValue("1.200.000");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1.250.000");
    await userEvent.click(within(row).getByRole("button", { name: "Confirmar movimiento" }));
    expect(await screen.findByText("Movimiento guardado")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ amount: 1250000 });
  });

  it("keeps feedback after the confirmed item disappears", async () => {
    let confirmed = false;
    const income = { ...pending, type: "income" };
    mockApi({
      "GET /api/accounts": () => ({ body: accounts }),
      "GET /api/categories": () => ({ body: categories }),
      "GET /api/transactions": () => ({ body: { items: confirmed ? [] : [income], next_cursor: null } }),
      "POST /api/transactions/p1/confirm": () => {
        confirmed = true;
        return {
          body: {
            transaction: { ...income, status: "confirmed" },
            budget_status: null,
            savings_suggestion: { amount: 300000, from_account_id: "a1", to_account_id: "a9", date: "2026-10-01" },
          },
        };
      },
    });
    renderWithClient(<PendingList />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Confirmar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Confirmar movimiento" }));
    expect(await screen.findByText("Movimiento guardado")).toBeInTheDocument();
    expect(screen.getByText(/¿apartas \$300\.000 para tu ahorro\?/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Por confirmar" })).not.toBeInTheDocument());
    expect(screen.getByText("Movimiento guardado")).toBeInTheDocument();
  });

  it("discards a pending movement", async () => {
    const { calls } = setup([pending], { "DELETE /api/transactions/p1": () => ({ status: 204 }) });
    renderWithClient(<PendingList />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Descartar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, descartar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
});
