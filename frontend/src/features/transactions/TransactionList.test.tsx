import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addMonths, currentMonth, monthRange } from "@/lib/dates";
import { mockApi, type MockRequest } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { TransactionList, signedAmount } from "./TransactionList";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
  { id: "a2", name: "Ahorro", type: "savings", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [{ id: "c1", name: "Comida", kind: "expense", archived: false }];
const base = {
  status: "confirmed", source: "manual", created_at: "2026-10-03T12:00:00Z",
  recurring_template_id: null, to_account_id: null,
};
const expense = { ...base, id: "t1", type: "expense", amount: 35000, date: "2026-10-03", account_id: "a1", category_id: "c1", description: "Almuerzo" };
const transfer = { ...base, id: "t2", type: "transfer", amount: 600000, date: "2026-10-02", account_id: "a1", to_account_id: "a2", category_id: null, description: null };

function setup(list: (req: MockRequest) => { status?: number; body?: unknown }, extra = {}) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/transactions": list,
    ...extra,
  });
}

describe("signedAmount", () => {
  it("signs by type", () => {
    expect(signedAmount({ type: "expense", amount: 35000 })).toBe("-$35.000");
    expect(signedAmount({ type: "income", amount: 35000 })).toBe("$35.000");
    expect(signedAmount({ type: "transfer", amount: 600000 })).toBe("$600.000");
  });
});

describe("TransactionList", () => {
  it("lists confirmed movements of the current month", async () => {
    const { calls } = setup(() => ({ body: { items: [expense, transfer], next_cursor: null } }));
    renderWithClient(<TransactionList />);
    const row = (await screen.findByText("Almuerzo")).closest("li")!;
    expect(within(row).getByText("-$35.000")).toBeInTheDocument();
    expect(within(row).getByText(/Comida · Bancolombia/)).toBeInTheDocument();
    expect(screen.getByText(/Bancolombia → Ahorro/)).toBeInTheDocument();
    const query = calls.find((c) => c.path === "/api/transactions")!.url.searchParams;
    const range = monthRange(currentMonth());
    expect(query.get("from")).toBe(range.from);
    expect(query.get("to")).toBe(range.to);
    expect(query.get("status")).toBe("confirmed");
  });

  it("changes month and filters by type", async () => {
    const { calls } = setup(() => ({ body: { items: [], next_cursor: null } }));
    renderWithClient(<TransactionList />);
    expect(await screen.findByText("No hay movimientos en este mes.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await waitFor(() =>
      expect(calls.at(-1)!.url.searchParams.get("from")).toBe(`${addMonths(currentMonth(), -1)}-01`),
    );
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "expense");
    await waitFor(() => expect(calls.at(-1)!.url.searchParams.get("type")).toBe("expense"));
  });

  it("loads more pages with the cursor", async () => {
    const { calls } = setup(({ url }) =>
      url.searchParams.get("cursor")
        ? { body: { items: [transfer], next_cursor: null } }
        : { body: { items: [expense], next_cursor: "CUR1" } },
    );
    renderWithClient(<TransactionList />);
    await userEvent.click(await screen.findByRole("button", { name: "Cargar más" }));
    expect(await screen.findByText(/Bancolombia → Ahorro/)).toBeInTheDocument();
    expect(calls.at(-1)!.url.searchParams.get("cursor")).toBe("CUR1");
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("edits and deletes a movement", async () => {
    const { calls } = setup(() => ({ body: { items: [expense], next_cursor: null } }), {
      "PATCH /api/transactions/t1": () => ({ body: { ...expense, amount: 40000 } }),
      "DELETE /api/transactions/t1": () => ({ status: 204 }),
    });
    renderWithClient(<TransactionList />);
    const row = (await screen.findByText("Almuerzo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Editar" }));
    const amount = within(row).getByLabelText("Monto");
    await userEvent.clear(amount);
    await userEvent.type(amount, "40.000");
    await userEvent.click(within(row).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ amount: 40000, category_id: "c1" }),
    );
    const again = (await screen.findByText("Almuerzo")).closest("li")!;
    await userEvent.click(within(again).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(again).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
});
