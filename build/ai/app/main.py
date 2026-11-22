import asyncio
import hmac
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.settings import Settings
from app.schemas import ChatRequest, ExplainRequest, Explanation, ExtractionRequest, ExtractionResponse
from app.extraction import extract
from app.explanations import chat, explain
from app.limits import RequestGate


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    application = FastAPI(title="CareLoop AI", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
    slots = asyncio.Semaphore(2)
    application.add_middleware(RequestGate, token=config.ai_service_token.get_secret_value())

    def authorize(authorization: str = Header(default="")) -> None:
        secret = config.ai_service_token.get_secret_value()
        if len(secret) < 32:
            raise HTTPException(503, "Service authentication is not configured")
        if not hmac.compare_digest(authorization, f"Bearer {secret}"):
            raise HTTPException(401, "Service authentication failed")

    @application.middleware("http")
    async def limits(request: Request, call_next: Any) -> Any:
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse({"error": "Invalid request"}, status_code=400)
        if size > 15_000_000:
            return JSONResponse({"error": "Request too large"}, status_code=413)
        return await call_next(request)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse({"error": "Invalid request fields"}, status_code=422)

    @application.exception_handler(Exception)
    async def private_error(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse({"error": "Processing unavailable; the report needs review"}, status_code=422)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ai", "mode": config.ai_mode}

    @application.post("/extract", response_model=ExtractionResponse, dependencies=[Depends(authorize)])
    async def extract_report(request: ExtractionRequest) -> ExtractionResponse:
        async with slots:
            try:
                return await extract(request, config)
            except Exception:
                raise HTTPException(422, "Extraction failed; the original report needs human review") from None

    @application.post("/explain", response_model=Explanation, dependencies=[Depends(authorize)])
    async def explain_report(request: ExplainRequest) -> Explanation:
        async with slots:
            try:
                return await explain(request, config)
            except Exception:
                raise HTTPException(422, "Explanation could not be verified") from None

    @application.post("/chat", dependencies=[Depends(authorize)])
    async def report_chat(request: ChatRequest) -> dict[str, str]:
        async with slots:
            try:
                return {"answer": await chat(request, config)}
            except Exception:
                raise HTTPException(422, "The response could not be verified") from None

    return application


app = create_app()
