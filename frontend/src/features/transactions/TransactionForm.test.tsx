import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { todayISO } from "@/lib/dates";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { TransactionForm } from "./TransactionForm";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
  { id: "a2", name: "Ahorro", type: "savings", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [
  { id: "c1", name: "Comida", kind: "expense", archived: false },
  { id: "c2", name: "Salario", kind: "income", archived: false },
];

function setup() {
  mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
  });
}

describe("TransactionForm", () => {
  it("prefills values and highlights missing fields", async () => {
    setup();
    renderWithClient(
      <TransactionForm
        initial={{ type: "expense", category_id: "c1", description: "Almuerzo" }}
        missingFields={["amount", "account_id"]}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("Categoría")).toHaveValue("c1"));
    expect(screen.getByLabelText("Descripción")).toHaveValue("Almuerzo");
    expect(screen.getByLabelText("Monto")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Cuenta")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Fecha")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Revisa este dato")).toHaveLength(2);
  });

  it("defaults date to today in Bogotá and account to the last one used", async () => {
    window.localStorage.setItem("finanzas.lastAccountId", "a2");
    setup();
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Cuenta")).toHaveValue("a2"));
    expect(screen.getByLabelText("Fecha")).toHaveValue(todayISO());
  });

  it("submits an expense with the parsed amount and remembers the account", async () => {
    setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.type(await screen.findByLabelText("Monto"), "35.000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.type(screen.getByLabelText("Descripción"), "Almuerzo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "expense",
      amount: 35000,
      date: todayISO(),
      account_id: "a1",
      to_account_id: null,
      category_id: "c1",
      description: "Almuerzo",
    });
    expect(window.localStorage.getItem("finanzas.lastAccountId")).toBe("a1");
  });

  it("only offers categories of the selected type", async () => {
    setup();
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={vi.fn()} />);
    const select = await screen.findByLabelText("Categoría");
    expect(select).toContainElement(await screen.findByRole("option", { name: "Comida" }));
    expect(screen.queryByRole("option", { name: "Salario" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Ingreso" }));
    expect(screen.getByRole("option", { name: "Salario" })).toBeInTheDocument();
  });

  it("asks for a destination on transfers and hides the category", async () => {
    setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.click(await screen.findByRole("radio", { name: "Transferencia" }));
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Monto"), "600000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige la cuenta de destino");
    await userEvent.selectOptions(screen.getByLabelText("Hacia la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "transfer", to_account_id: "a2", category_id: null }),
      ),
    );
  });

  it("validates before submitting", async () => {
    setup();
    const onSubmit = vi.fn();
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.type(await screen.findByLabelText("Monto"), "35,5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Usa solo pesos enteros");
    expect(alert).toHaveTextContent("Elige una cuenta");
    expect(alert).toHaveTextContent("Elige una categoría");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps every value when the server rejects the save", async () => {
    setup();
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, "ACCOUNT_ARCHIVED", ""));
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.type(await screen.findByLabelText("Monto"), "35.000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa cuenta está archivada.");
    expect(screen.getByLabelText("Monto")).toHaveValue("35.000");
    expect(screen.getByLabelText("Cuenta")).toHaveValue("a1");
    expect(screen.getByLabelText("Categoría")).toHaveValue("c1");
  });
});
