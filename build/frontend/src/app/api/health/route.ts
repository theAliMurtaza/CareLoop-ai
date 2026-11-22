export function GET() {
  return Response.json({
    status: "ok",
    service: "frontend",
    mode: "synthetic-only",
  });
}
