import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];

export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  // Se resuelve en cada llamada para que los tests puedan reemplazar fetch.
  fetch: (request: Request) => globalThis.fetch(request),
});
