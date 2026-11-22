import hmac

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestGate:
    """Authenticate before parsing and cap actual bytes, including chunked bodies."""
    def __init__(self, app: ASGIApp, token: str, max_bytes: int = 15_000_000) -> None:
        self.app, self.token, self.max_bytes = app, token, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] not in {"/extract", "/explain", "/chat"}:
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        if len(self.token) < 32 or not hmac.compare_digest(headers.get(b"authorization", b""), f"Bearer {self.token}".encode()):
            await JSONResponse({"error": "Service authentication failed"}, status_code=401)(scope, receive, send)
            return
        content = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            content.extend(message.get("body", b""))
            if len(content) > self.max_bytes:
                await JSONResponse({"error": "Request too large"}, status_code=413)(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        delivered = False
        async def replay() -> Message:
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(content), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)
