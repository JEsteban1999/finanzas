export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "No hay conexión con el servidor.",
  NOT_AUTHENTICATED: "Tu sesión terminó. Inicia sesión de nuevo.",
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  LOGIN_RATE_LIMITED: "Demasiados intentos. Espera un minuto.",
  INVALID_INVITATION: "La invitación no es válida o ya expiró.",
  WRONG_PASSWORD: "La contraseña actual no es correcta.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  AI_UNAVAILABLE: "No pude interpretarlo, complétalo a mano.",
  AI_RATE_LIMITED: "Hiciste muchas solicitudes seguidas. Regístralo a mano o intenta en un rato.",
  ACCOUNT_ARCHIVED: "Esa cuenta está archivada.",
  CATEGORY_ARCHIVED: "Esa categoría está archivada.",
  ACCOUNT_NAME_TAKEN: "Ya tienes una cuenta con ese nombre.",
  CATEGORY_NAME_TAKEN: "Ya tienes una categoría con ese nombre.",
  ACCOUNT_IN_USE: "La cuenta está en uso; archívala en su lugar.",
  CATEGORY_IN_USE: "La categoría está en uso; archívala en su lugar.",
  DUPLICATE_OCCURRENCE: "Ya existe ese movimiento recurrente en esa fecha.",
  START_DATE_TOO_OLD: "La fecha de inicio no puede ser de hace más de un año.",
  TRANSACTION_NOT_PENDING: "Ese movimiento ya estaba confirmado.",
};

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? (error.message || "Algo salió mal. Intenta de nuevo.");
  }
  return "Algo salió mal. Intenta de nuevo.";
}

type ErrorBody = { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
type FetchResult<T> = { data?: T; error?: unknown; response: Response };

export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Sin conexión");
  }
  if (!result.response.ok) {
    const body = (result.error ?? {}) as ErrorBody;
    throw new ApiError(
      result.response.status,
      body.error?.code ?? `HTTP_${result.response.status}`,
      body.error?.message ?? "",
      body.error?.details ?? {},
    );
  }
  return result.data as T;
}
