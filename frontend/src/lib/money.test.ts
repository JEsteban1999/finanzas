import { describe, expect, it } from "vitest";
import { formatCOP, parseAmount } from "./money";

describe("formatCOP", () => {
  it.each([
    [1250000, "$1.250.000"],
    [35000, "$35.000"],
    [999, "$999"],
    [1000, "$1.000"],
    [0, "$0"],
    [-50000, "-$50.000"],
  ])("%d → %s", (amount, expected) => {
    expect(formatCOP(amount)).toBe(expected);
  });
});

describe("parseAmount", () => {
  it.each([
    ["35000", 35000],
    ["35.000", 35000],
    ["$ 35.000", 35000],
    ["$1.250.000", 1250000],
    [" 1000 ", 1000],
  ])("accepts %s", (input, value) => {
    expect(parseAmount(input)).toEqual({ ok: true, value });
  });

  it.each([
    ["", "Escribe el monto"],
    ["0", "El monto debe ser mayor que 0"],
    ["35,5", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["35.5", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["3.50.000", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["abc", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["-5000", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["1000000000001", "El monto es demasiado grande"],
  ])("rejects %s", (input, error) => {
    expect(parseAmount(input)).toEqual({ ok: false, error });
  });
});
