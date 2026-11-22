from fastapi import FastAPI
from pydantic import BaseModel

from app.settings import Settings


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "ai"
    phase: str = "scaffold"


def create_app() -> FastAPI:
    # Validate environment without logging settings or provider keys.
    Settings()
    application = FastAPI(title="CareLoop AI", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    return application


app = create_app()
