import { messageFor } from "@/lib/api/errors";

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert">{typeof error === "string" ? error : messageFor(error)}</p>;
}
