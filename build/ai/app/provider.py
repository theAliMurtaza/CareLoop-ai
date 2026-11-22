import json
from typing import Any

import httpx

from app.settings import Settings


async def completion(settings: Settings, system: str, prompt: str) -> str:
    """No prompt logging or implicit tracing callbacks. Only synthetic content is allowed."""
    async with httpx.AsyncClient(timeout=45.0) as client:
        if settings.llm_provider == "ollama":
            response = await client.post(f"{settings.ollama_base_url.rstrip('/')}/api/chat", json={"model": settings.llm_model, "stream": False, "format": "json", "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}], "options": {"temperature": 0}})
            response.raise_for_status()
            return str(response.json()["message"]["content"])
        if settings.llm_provider == "groq":
            response = await client.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {settings.groq_api_key.get_secret_value()}"}, json={"model": settings.llm_model, "temperature": 0, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]})
            response.raise_for_status()
            return str(response.json()["choices"][0]["message"]["content"])
        response = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{settings.llm_model}:generateContent", headers={"x-goog-api-key": settings.gemini_api_key.get_secret_value()}, json={"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}})
        response.raise_for_status()
        return str(response.json()["candidates"][0]["content"]["parts"][0]["text"])


def json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = "\n".join(stripped.splitlines()[1:-1])
    value = json.loads(stripped)
    if not isinstance(value, dict):
        raise ValueError("Expected object")
    return value
