const TARGET_BASE = (Deno.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

Deno.serve(async (request) => {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const url = new URL(request.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    let clientIp = null;

    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();

      if (STRIP_HEADERS.has(k)) continue;

      if (k === "x-real-ip") {
        clientIp = value;
        continue;
      }

      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = value;
        continue;
      }

      headers.set(k, value);
    }

    if (clientIp) headers.set("x-forwarded-for", clientIp);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
    });

    const responseHeaders = new Headers();

    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase() === "transfer-encoding") continue;
      responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response("Bad Gateway: Relay Failed", { status: 502 });
  }
});