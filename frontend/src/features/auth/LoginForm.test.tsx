import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { mockRouter } from "@/test/router";
import { LoginForm, safeNext } from "./LoginForm";

const user = { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" };

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
  await userEvent.type(screen.getByLabelText("Contraseña"), "clave-segura-123");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("logs in and goes home", async () => {
    const { calls } = mockApi({ "POST /api/auth/login": () => ({ body: user }) });
    renderWithClient(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    expect(calls[0].body).toEqual({ email: "ana@example.com", password: "clave-segura-123" });
  });

  it("honors a safe next parameter", async () => {
    window.history.replaceState(null, "", "/login?next=/movimientos");
    mockApi({ "POST /api/auth/login": () => ({ body: user }) });
    renderWithClient(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/movimientos"));
  });

  it("shows the error and keeps what was typed", async () => {
    mockApi({ "POST /api/auth/login": () => apiError(401, "INVALID_CREDENTIALS") });
    renderWithClient(<LoginForm />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("safeNext", () => {
  it.each([
    ["/movimientos", "/movimientos"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
