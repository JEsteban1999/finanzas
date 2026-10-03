import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi, type Handler } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { RegisterFlow } from "./RegisterFlow";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [{ id: "c1", name: "Comida", kind: "expense", archived: false }];
const saved = {
  status: 201,
  body: {
    transaction: {
      id: "t1", type: "expense", amount: 35000, date: "2026-10-03", account_id: "a1",
      to_account_id: null, category_id: "c1", description: "Almuerzo", status: "confirmed",
      source: "voice", created_at: "2026-10-03T12:00:00Z", recurring_template_id: null,
    },
    budget_status: null,
    savings_suggestion: null,
  },
};

function setup(parse: Handler) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "POST /api/ai/parse-transaction": parse,
    "POST /api/transactions": () => saved,
  });
}

async function interpret(text: string) {
  await userEvent.type(screen.getByLabelText("Cuéntame el movimiento"), text);
  await userEvent.click(screen.getByRole("button", { name: "Interpretar" }));
}

describe("RegisterFlow", () => {
  it("disables Interpretar while the box is empty and hides Dictar without support", () => {
    setup(() => ({ body: {} }));
    renderWithClient(<RegisterFlow />);
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Dictar" })).not.toBeInTheDocument();
  });

  it("fills the box from speech recognition", async () => {
    const instances: { onresult: ((e: unknown) => void) | null; lang: string }[] = [];
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() { instances.push(this); }
      stop() { this.onend?.(); }
    }
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    setup(() => ({ body: {} }));
    renderWithClient(<RegisterFlow />);
    await userEvent.click(await screen.findByRole("button", { name: "Dictar" }));
    expect(instances[0].lang).toBe("es-CO");
    act(() => {
      instances[0].onresult?.({ results: [{ 0: { transcript: "almorcé 35 mil" }, isFinal: true, length: 1 }] });
    });
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("almorcé 35 mil");
  });

  it("prefills the form from the draft and saves as voice", async () => {
    const { calls } = setup(() => ({
      body: {
        type: "expense", amount: 35000, date: "2026-10-03", account_id: null, to_account_id: null,
        category_id: "c1", description: "Almuerzo", missing_fields: ["account_id"], notes: [],
      },
    }));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    expect(await screen.findByLabelText("Monto")).toHaveValue("35.000");
    expect(screen.getByLabelText("Cuenta")).toHaveAttribute("aria-invalid", "true");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Movimiento guardado")).toBeInTheDocument();
    const post = calls.find((c) => c.path === "/api/transactions" && c.method === "POST")!;
    expect(post.body).toMatchObject({ amount: 35000, category_id: "c1", account_id: "a1", source: "voice" });
  });

  it("falls back to an empty form and keeps the text when the AI is unavailable", async () => {
    setup(() => apiError(503, "AI_UNAVAILABLE"));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    expect(await screen.findByText("No pude interpretarlo, complétalo a mano.")).toBeInTheDocument();
    expect(screen.getByText("Dijiste: almorcé 35 mil")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toHaveValue("");
  });

  it("stays on the text box when rate limited", async () => {
    setup(() => apiError(429, "AI_RATE_LIMITED"));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    expect(await screen.findByRole("alert")).toHaveTextContent("Hiciste muchas solicitudes seguidas");
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("almorcé 35 mil");
    expect(screen.queryByLabelText("Monto")).not.toBeInTheDocument();
  });

  it("cancel returns to the box with the text intact", async () => {
    setup(() => apiError(503, "AI_UNAVAILABLE"));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("almorcé 35 mil");
  });

  it("manual entry saves with source manual and Listo resets", async () => {
    const { calls } = setup(() => ({ body: {} }));
    renderWithClient(<RegisterFlow />);
    await userEvent.click(screen.getByRole("button", { name: "Registrar a mano" }));
    await userEvent.type(await screen.findByLabelText("Monto"), "35000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Listo" }));
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("");
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/transactions")!.body).toMatchObject({ source: "manual" }),
    );
  });
});
