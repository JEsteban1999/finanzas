import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { AuthGuard } from "./AuthGuard";

describe("AuthGuard", () => {
  it("renders children once the session is valid", async () => {
    mockApi({
      "GET /api/auth/me": () => ({
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
    });
    renderWithClient(<AuthGuard><p>contenido privado</p></AuthGuard>);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(await screen.findByText("contenido privado")).toBeInTheDocument();
  });

  it("shows a redirect notice on 401", async () => {
    mockApi({ "GET /api/auth/me": () => apiError(401, "NOT_AUTHENTICATED") });
    renderWithClient(<AuthGuard><p>contenido privado</p></AuthGuard>);
    expect(await screen.findByText("Redirigiendo…")).toBeInTheDocument();
    expect(screen.queryByText("contenido privado")).not.toBeInTheDocument();
  });

  it("offers a retry on other errors", async () => {
    mockApi({ "GET /api/auth/me": () => apiError(500, "HTTP_500", "fallo") });
    renderWithClient(<AuthGuard><p>contenido privado</p></AuthGuard>);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
