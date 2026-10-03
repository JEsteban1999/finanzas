import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { SavingsRuleForm } from "./SavingsRuleForm";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
  { id: "a2", name: "Ahorro", type: "savings", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [
  { id: "c1", name: "Comida", kind: "expense", archived: false },
  { id: "c2", name: "Salario", kind: "income", archived: false },
];
const rule = { mode: "percent", value: 20, trigger_category_id: "c2", target_account_id: "a2", active: true };

function setup(current: unknown, accountList = accounts) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accountList }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/savings-rule": () => ({ body: current }),
    "PUT /api/savings-rule": ({ body }) => ({ body }),
    "DELETE /api/savings-rule": () => ({ status: 204 }),
  });
}

describe("SavingsRuleForm", () => {
  it("prefills the existing rule", async () => {
    setup(rule);
    renderWithClient(<SavingsRuleForm />);
    await waitFor(() => expect(screen.getByLabelText("Valor")).toHaveValue("20"));
    expect(screen.getByLabelText("Modo")).toHaveValue("percent");
    expect(screen.getByLabelText("Cuando entre dinero en")).toHaveValue("c2");
    expect(screen.getByLabelText("Apartar en la cuenta")).toHaveValue("a2");
    expect(screen.queryByRole("option", { name: "Comida" })).not.toBeInTheDocument();
  });

  it("saves a fixed-amount rule", async () => {
    const { calls } = setup(null);
    renderWithClient(<SavingsRuleForm />);
    await userEvent.selectOptions(await screen.findByLabelText("Modo"), "fixed");
    await userEvent.type(screen.getByLabelText("Valor"), "500.000");
    await userEvent.selectOptions(screen.getByLabelText("Cuando entre dinero en"), "c2");
    await userEvent.selectOptions(screen.getByLabelText("Apartar en la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar regla" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Regla guardada");
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      mode: "fixed", value: 500000, trigger_category_id: "c2", target_account_id: "a2", active: true,
    });
  });

  it("validates the percentage", async () => {
    const { calls } = setup(null);
    renderWithClient(<SavingsRuleForm />);
    await userEvent.type(await screen.findByLabelText("Valor"), "101");
    await userEvent.selectOptions(screen.getByLabelText("Cuando entre dinero en"), "c2");
    await userEvent.selectOptions(screen.getByLabelText("Apartar en la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar regla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("entre 1 y 100");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("asks for a savings account first", async () => {
    setup(null, [accounts[0]]);
    renderWithClient(<SavingsRuleForm />);
    expect(await screen.findByText("Primero crea una cuenta de tipo Ahorro.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a cuentas" })).toHaveAttribute("href", "/mas/cuentas");
  });

  it("removes the rule", async () => {
    const { calls } = setup(rule);
    renderWithClient(<SavingsRuleForm />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar regla" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
  it("keeps the saved confirmation after the first save", async () => {
    let stored: unknown = null;
    mockApi({
      "GET /api/accounts": () => ({ body: accounts }),
      "GET /api/categories": () => ({ body: categories }),
      "GET /api/savings-rule": () => ({ body: stored }),
      "PUT /api/savings-rule": ({ body }) => {
        stored = body;
        return { body };
      },
    });
    renderWithClient(<SavingsRuleForm />);
    await userEvent.type(await screen.findByLabelText("Valor"), "20");
    await userEvent.selectOptions(screen.getByLabelText("Cuando entre dinero en"), "c2");
    await userEvent.selectOptions(screen.getByLabelText("Apartar en la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar regla" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Regla guardada");
    expect(await screen.findByRole("button", { name: "Quitar regla" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Regla guardada");
  });
});
