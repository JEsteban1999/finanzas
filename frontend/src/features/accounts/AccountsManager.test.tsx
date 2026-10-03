import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { AccountsManager, parseSignedAmount } from "./AccountsManager";

const debit = { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 1250000 };

describe("parseSignedAmount", () => {
  it("accepts empty and negative values", () => {
    expect(parseSignedAmount("")).toEqual({ ok: true, value: 0 });
    expect(parseSignedAmount("-150.000")).toEqual({ ok: true, value: -150000 });
    expect(parseSignedAmount("20.000")).toEqual({ ok: true, value: 20000 });
    expect(parseSignedAmount("1,5").ok).toBe(false);
  });
});

describe("AccountsManager", () => {
  it("lists accounts with their balance", async () => {
    mockApi({ "GET /api/accounts": () => ({ body: [debit] }) });
    renderWithClient(<AccountsManager />);
    const row = (await screen.findByText("Bancolombia")).closest("li")!;
    expect(within(row).getByText("Débito")).toBeInTheDocument();
    expect(within(row).getByText("$1.250.000")).toBeInTheDocument();
  });

  it("creates an account with a negative initial balance", async () => {
    const { calls } = mockApi({
      "GET /api/accounts": () => ({ body: [] }),
      "POST /api/accounts": () => ({ status: 201, body: { ...debit, id: "a2", name: "Nu", type: "credit_card" } }),
    });
    renderWithClient(<AccountsManager />);
    await userEvent.type(await screen.findByLabelText("Nombre de la cuenta"), "Nu");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "credit_card");
    await userEvent.type(screen.getByLabelText("Saldo inicial"), "-150.000");
    await userEvent.click(screen.getByRole("button", { name: "Agregar cuenta" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      name: "Nu", type: "credit_card", initial_balance: -150000,
    });
  });

  it("keeps the typed name when the server rejects a duplicate", async () => {
    mockApi({
      "GET /api/accounts": () => ({ body: [debit] }),
      "POST /api/accounts": () => apiError(409, "ACCOUNT_NAME_TAKEN"),
    });
    renderWithClient(<AccountsManager />);
    await userEvent.type(await screen.findByLabelText("Nombre de la cuenta"), "bancolombia");
    await userEvent.click(screen.getByRole("button", { name: "Agregar cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya tienes una cuenta con ese nombre.");
    expect(screen.getByLabelText("Nombre de la cuenta")).toHaveValue("bancolombia");
  });

  it("archives and deletes accounts", async () => {
    const { calls } = mockApi({
      "GET /api/accounts": () => ({ body: [debit] }),
      "PATCH /api/accounts/a1": () => ({ body: { ...debit, archived: true } }),
      "DELETE /api/accounts/a1": () => ({ status: 204 }),
    });
    renderWithClient(<AccountsManager />);
    const row = (await screen.findByText("Bancolombia")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Archivar" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ archived: true }),
    );
    await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("renames inline", async () => {
    const { calls } = mockApi({
      "GET /api/accounts": () => ({ body: [debit] }),
      "PATCH /api/accounts/a1": () => ({ body: { ...debit, name: "Bancolombia nómina" } }),
    });
    renderWithClient(<AccountsManager />);
    const row = (await screen.findByText("Bancolombia")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Renombrar" }));
    const input = within(row).getByLabelText("Nuevo nombre");
    await userEvent.clear(input);
    await userEvent.type(input, "Bancolombia nómina");
    await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ name: "Bancolombia nómina" }),
    );
  });
});
