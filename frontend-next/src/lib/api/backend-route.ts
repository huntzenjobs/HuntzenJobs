const BACKEND_TIMEOUT_MS = 15_000;

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
    const upstream = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    return new Response(await upstream.arrayBuffer(), {
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
