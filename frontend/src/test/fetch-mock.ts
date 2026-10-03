import { vi } from "vitest";

export type MockRequest = { body: unknown; url: URL };
export type Handler = (req: MockRequest) => { status?: number; body?: unknown };
export type MockCall = { method: string; path: string; body: unknown; url: URL };

export function mockApi(routes: Record<string, Handler>) {
  const calls: MockCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const body = text ? JSON.parse(text) : undefined;
    const key = `${request.method} ${url.pathname}`;
    calls.push({ method: request.method, path: url.pathname, body, url });
    const handler = routes[key];
    if (!handler) {
      return json(500, { error: { code: "NOT_MOCKED", message: key, details: {} } });
    }
    const { status = 200, body: responseBody } = handler({ body, url });
    if (status === 204) return new Response(null, { status });
    return json(status, responseBody ?? null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function apiError(status: number, code: string, message = code) {
  return { status, body: { error: { code, message, details: {} } } };
}
