"""Minimal OpenRouter client (chat.completions). JSON-mode aware with markdown unwrap."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("openrouter")

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT = 120.0

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s.strip()


class OpenRouterError(Exception):
    pass


class OpenRouterClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
        fallback_model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.default_model = default_model or os.environ.get(
            "OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5"
        )
        self.fallback_model = fallback_model or os.environ.get(
            "OPENROUTER_FALLBACK_MODEL", "meta-llama/llama-3.3-70b-instruct:free"
        )
        if not self.api_key:
            log.warning("OPENROUTER_API_KEY not set")

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://bybloomlabs.com",
            "X-Title": "Bloom Labs Admin Dashboard",
        }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1500,
        json_mode: bool = False,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> str:
        body: Dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        async def _attempt(use_model: str) -> str:
            body["model"] = use_model
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(
                    f"{OPENROUTER_BASE}/chat/completions",
                    headers=self.headers,
                    json=body,
                )
                if r.status_code != 200:
                    raise OpenRouterError(
                        f"OpenRouter {r.status_code}: {r.text[:500]}"
                    )
                data = r.json()
                try:
                    return data["choices"][0]["message"]["content"]
                except (KeyError, IndexError, TypeError) as exc:
                    raise OpenRouterError(f"Bad response shape: {data}") from exc

        try:
            return await _attempt(body["model"])
        except OpenRouterError as e:
            log.warning("Primary model failed (%s). Falling back to %s", e, self.fallback_model)
            if self.fallback_model and self.fallback_model != body["model"]:
                return await _attempt(self.fallback_model)
            raise

    async def chat_json(
        self,
        messages: List[Dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.6,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        """Chat that returns parsed JSON. Strips markdown fences if present."""
        raw = await self.chat(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=True,
        )
        cleaned = _strip_code_fence(raw)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # Sometimes models leak text around JSON; try to find a JSON object
            m = re.search(r"\{[\s\S]*\}", cleaned)
            if m:
                return json.loads(m.group(0))
            raise OpenRouterError(f"Could not parse JSON. Raw: {raw[:400]}")
