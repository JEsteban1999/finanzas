import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "./ConfirmButton";

describe("ConfirmButton", () => {
  it("asks before confirming", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Borrar" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(screen.getByText("¿Seguro?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
