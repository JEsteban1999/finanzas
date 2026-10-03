import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { CompareView } from "./CompareView";

const body = {
  months: [
    { month: "2026-09", income: 3000000, expense: 200000, savings: 0 },
    { month: "2026-10", income: 3000000, expense: 400000, savings: 500000 },
  ],
  categories: [
    { category_id: "c1", name: "Comida", current: 300000, previous: 200000, delta: 100000, delta_pct: 50 },
    { category_id: "c2", name: "Transporte", current: 100000, previous: 0, delta: 100000, delta_pct: null },
  ],
};

describe("CompareView", () => {
  it("renders months and category changes", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/compare": () => ({ body }) });
    renderWithClient(<CompareView />);
    expect(await screen.findByRole("row", { name: /octubre de 2026/ })).toHaveTextContent("$400.000");
    expect(screen.getByText(/Comida: \$300\.000 \(\+50,0%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Transporte: \$100\.000 \(nuevo\)/)).toBeInTheDocument();
    expect(calls[0].url.searchParams.get("months")).toBe("6");
  });

  it("changes the number of months", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/compare": () => ({ body }) });
    renderWithClient(<CompareView />);
    await screen.findByRole("row", { name: /octubre de 2026/ });
    await userEvent.selectOptions(screen.getByLabelText("Meses"), "12");
    await waitFor(() => expect(calls.at(-1)!.url.searchParams.get("months")).toBe("12"));
  });
});
