from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    test_code: str = Field(alias="testCode", min_length=1, max_length=80)
    value: float = Field(allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=40)
    comparator: Literal["=", "<", ">", "<=", ">="] = "="
    evidence: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(ge=0, le=1)


class ExtractionRequest(BaseModel):
    fileBase64: str = Field(max_length=14_000_000)
    mime: Literal["application/pdf", "image/png", "image/jpeg"]
    synthetic: Literal[True]


class ExtractionResponse(BaseModel):
    values: list[Observation]
    warnings: list[str] = Field(default_factory=list)


class Chunk(BaseModel):
    id: str
    content: str = Field(max_length=6000)
    source: str = Field(max_length=500)


class ExplainRequest(BaseModel):
    locale: Literal["en", "ur"] = "en"
    values: list[dict[str, Any]] = Field(max_length=200)
    chunks: list[Chunk] = Field(max_length=5)


class Explanation(BaseModel):
    whatThisMeans: str
    whatCanAffectIt: str
    questionsToAsk: str
    doctorPointer: str
    sources: list[dict[str, str]]
    mode: str


class ChatRequest(ExplainRequest):
    message: str = Field(min_length=1, max_length=1000)
