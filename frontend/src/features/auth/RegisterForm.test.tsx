import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { mockRouter } from "@/test/router";
import { RegisterForm } from "./RegisterForm";

async function fill(password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText("Tu nombre"), "Ana");
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
  await userEvent.type(screen.getByLabelText("Repite la contraseña"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

describe("RegisterForm", () => {
  it("registers with the invitation token from the URL", async () => {
    window.history.replaceState(null, "", "/registro?token=tok-1234567890");
    const { calls } = mockApi({
      "POST /api/auth/register": () => ({
        status: 201,
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
    });
    renderWithClient(<RegisterForm />);
    await fill("clave-segura-123", "clave-segura-123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    expect(calls[0].body).toEqual({
      token: "tok-1234567890",
      password: "clave-segura-123",
      display_name: "Ana",
    });
  });

  it("validates matching passwords and minimum length before calling the API", async () => {
    window.history.replaceState(null, "", "/registro?token=tok-1234567890");
    const { calls } = mockApi({});
    renderWithClient(<RegisterForm />);
    await fill("clave-segura-123", "otra-clave-123");
    expect(await screen.findByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    await userEvent.clear(screen.getByLabelText("Contraseña"));
    await userEvent.clear(screen.getByLabelText("Repite la contraseña"));
    await userEvent.type(screen.getByLabelText("Contraseña"), "corta");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "corta");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(calls).toHaveLength(0);
  });

  it("explains a missing or invalid invitation", async () => {
    window.history.replaceState(null, "", "/registro");
    renderWithClient(<RegisterForm />);
    expect(screen.getByText(/necesitas un enlace de invitación/i)).toBeInTheDocument();
  });

  it("shows the server error for an expired invitation", async () => {
    window.history.replaceState(null, "", "/registro?token=tok-1234567890");
    mockApi({ "POST /api/auth/register": () => apiError(400, "INVALID_INVITATION") });
    renderWithClient(<RegisterForm />);
    await fill("clave-segura-123", "clave-segura-123");
    expect(await screen.findByRole("alert")).toHaveTextContent("La invitación no es válida");
  });
});
