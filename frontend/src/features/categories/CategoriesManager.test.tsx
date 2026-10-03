import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { CategoriesManager } from "./CategoriesManager";

const categories = [
  { id: "c1", name: "Comida", kind: "expense", archived: false },
  { id: "c2", name: "Salario", kind: "income", archived: false },
];

describe("CategoriesManager", () => {
  it("groups categories by kind", async () => {
    mockApi({ "GET /api/categories": () => ({ body: categories }) });
    renderWithClient(<CategoriesManager />);
    const expenses = await screen.findByRole("region", { name: "Gastos" });
    const incomes = screen.getByRole("region", { name: "Ingresos" });
    expect(await within(expenses).findByText("Comida")).toBeInTheDocument();
    expect(within(incomes).getByText("Salario")).toBeInTheDocument();
  });

  it("creates a category", async () => {
    const { calls } = mockApi({
      "GET /api/categories": () => ({ body: categories }),
      "POST /api/categories": () => ({ status: 201, body: { id: "c3", name: "Mascotas", kind: "expense", archived: false } }),
    });
    renderWithClient(<CategoriesManager />);
    await userEvent.type(await screen.findByLabelText("Nombre de la categoría"), "Mascotas");
    await userEvent.selectOptions(screen.getByLabelText("Clase"), "expense");
    await userEvent.click(screen.getByRole("button", { name: "Agregar categoría" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Mascotas", kind: "expense" }),
    );
  });

  it("explains why a category in use cannot be deleted", async () => {
    mockApi({
      "GET /api/categories": () => ({ body: categories }),
      "DELETE /api/categories/c1": () => apiError(409, "CATEGORY_IN_USE"),
    });
    renderWithClient(<CategoriesManager />);
    const row = (await screen.findByText("Comida")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, borrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La categoría está en uso");
  });
});
