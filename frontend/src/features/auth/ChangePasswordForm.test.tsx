import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { ChangePasswordForm } from "./ChangePasswordForm";

async function submit(current: string, next: string, confirm = next) {
  await userEvent.type(screen.getByLabelText("Contraseña actual"), current);
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), next);
  await userEvent.type(screen.getByLabelText("Repite la nueva contraseña"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

describe("ChangePasswordForm", () => {
  it("changes the password and clears the fields", async () => {
    const { calls } = mockApi({ "POST /api/auth/change-password": () => ({ status: 204 }) });
    renderWithClient(<ChangePasswordForm />);
    await submit("clave-segura-123", "nueva-clave-456");
    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña actualizada");
    expect(calls[0].body).toEqual({
      current_password: "clave-segura-123",
      new_password: "nueva-clave-456",
    });
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  it("shows WRONG_PASSWORD", async () => {
    mockApi({ "POST /api/auth/change-password": () => apiError(400, "WRONG_PASSWORD") });
    renderWithClient(<ChangePasswordForm />);
    await submit("mala-clave-000", "nueva-clave-456");
    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta.");
  });
});
