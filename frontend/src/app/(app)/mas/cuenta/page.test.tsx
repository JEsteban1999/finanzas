import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { mockRouter } from "@/test/router";
import AccountPage from "./page";

describe("Mi cuenta", () => {
  it("shows the email and logs out", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": () => ({
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
      "POST /api/auth/logout": () => ({ status: 204 }),
    });
    renderWithClient(<AccountPage />);
    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(calls.some((c) => c.path === "/api/auth/logout")).toBe(true);
  });
});
