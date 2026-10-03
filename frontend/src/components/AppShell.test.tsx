import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the main navigation", () => {
    render(<AppShell><p>hola</p></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    for (const name of ["Inicio", "Movimientos", "Registrar", "Presupuestos", "Más"]) {
      expect(nav).toContainElement(screen.getByRole("link", { name }));
    }
    expect(screen.getByText("hola")).toBeInTheDocument();
  });

  it("marks the active section", () => {
    window.history.replaceState(null, "", "/movimientos");
    render(<AppShell><p /></AppShell>);
    expect(screen.getByRole("link", { name: "Movimientos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("marks Más for nested settings pages", () => {
    window.history.replaceState(null, "", "/mas/cuentas");
    render(<AppShell><p /></AppShell>);
    expect(screen.getByRole("link", { name: "Más" })).toHaveAttribute("aria-current", "page");
  });
});
