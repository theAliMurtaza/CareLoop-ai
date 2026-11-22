import { NextRequest } from "next/server";
const allowed = new Set([
  "auth",
  "reports",
  "profile",
  "medications",
  "reminders",
  "follow-ups",
  "trends",
  "notifications",
  "clinic",
]);
async function boundedBody(
  request: NextRequest,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (["GET", "HEAD"].includes(request.method) || !request.body)
    return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 11 * 1024 * 1024) {
      await reader.cancel();
      throw new RangeError("Upload too large");
    }
    chunks.push(part.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path[0] || !allowed.has(path[0]))
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Endpoint unavailable." } },
      { status: 404 },
    );
  const origin = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const url = new URL(
    "/api/" + path.map(encodeURIComponent).join("/") + request.nextUrl.search,
    origin,
  );
  const headers = new Headers();
  for (const name of [
    "content-type",
    "authorization",
    "cookie",
    "origin",
    "x-careloop-client",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const body = await boundedBody(request);
    const response = await fetch(url, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(100_000),
    });
    const resultHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "x-request-id"]) {
      const value = response.headers.get(name);
      if (value) resultHeaders.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie())
      resultHeaders.append("set-cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  } catch (error) {
    if (error instanceof RangeError)
      return Response.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "Maximum upload size is 10 MB.",
          },
        },
        { status: 413 },
      );
    return Response.json(
      {
        error: {
          code: "API_UNAVAILABLE",
          message: "CareLoop could not reach its API. Please try again.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
