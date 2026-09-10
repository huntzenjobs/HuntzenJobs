const BACKEND_TIMEOUT_MS = 15_000;
const PROXY_TIMING_HEADER = "x-huntzen-proxy-timing";
const SAFE_PROXY_TIMING = /^next-proxy-supabase;dur=(\d+(?:\.\d+)?)$/;
const SAFE_BACKEND_TIMING =
  /^(?:backend-[a-z-]+;dur=\d+(?:\.\d+)?(?:;desc="(?:hit|miss|unavailable|error)")?)(?:, backend-[a-z-]+;dur=\d+(?:\.\d+)?(?:;desc="(?:hit|miss|unavailable|error)")?)*$/;

function isAuthMeTimingEnabled(request: Request, backendPath: string): boolean {
  return (
    process.env.AUTH_ME_TIMING_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "staging" &&
    backendPath === "/api/auth/me" &&
    new URL(request.url).pathname === "/api/auth/me"
  );
}

function formatTiming(metric: string, startedAt: number): string {
  return `${metric};dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`;
}

function getSafeTiming(
  request: Request,
  upstream: Response,
): string[] {
  const timings: string[] = [];
  const backendTiming = upstream.headers.get("server-timing");
  if (backendTiming && SAFE_BACKEND_TIMING.test(backendTiming)) {
    timings.push(backendTiming);
  }

  const proxyTiming = request.headers.get(PROXY_TIMING_HEADER);
  if (proxyTiming && SAFE_PROXY_TIMING.test(proxyTiming)) {
    timings.push(proxyTiming);
  }

  return timings;
}

function backendUrl(): string | null {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    null
  );
}

export async function proxyBackendRequest(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const baseUrl = backendUrl();
  if (!baseUrl) {
    return Response.json({ detail: "Backend unavailable" }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(backendPath, baseUrl);
  upstreamUrl.search = requestUrl.search;
  const includeAuthMeTiming = isAuthMeTimingEnabled(request, backendPath);

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept-language"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text();
    const relayStartedAt = performance.now();
    const upstream = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    const upstreamBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    if (includeAuthMeTiming) {
      const relayTiming = formatTiming("next-backend", relayStartedAt);
      responseHeaders.set(
        "server-timing",
        [...getSafeTiming(request, upstream), relayTiming].join(", "),
      );
    }

    return new Response(upstreamBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return Response.json(
      { detail: timedOut ? "Backend timeout" : "Backend unavailable" },
      { status: timedOut ? 504 : 502 },
    );
  }
}
