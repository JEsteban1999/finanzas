import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthPicker } from "./MonthPicker";

describe("MonthPicker", () => {
  it("moves between months", async () => {
    const onChange = vi.fn();
    render(<MonthPicker month="2026-01" onChange={onChange} />);
    expect(screen.getByText("enero de 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(onChange).toHaveBeenLastCalledWith("2025-12");
    await userEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-02");
  });
});
