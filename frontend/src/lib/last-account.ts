const KEY = "finanzas.lastAccountId";

export function getLastAccountId(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastAccountId(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Sin almacenamiento disponible: la cuenta por defecto simplemente no se recuerda.
  }
}
