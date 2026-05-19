"""Blog system — public listing + admin CRUD + AI-assisted drafts."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from models import (
    BlogDraftPromptRequest,
    BlogPost,
    BlogPostCreate,
    BlogPostUpdate,
)
from pydantic import BaseModel, Field


class BlogSeoSuggestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=10)
    current_slug: str | None = None
    current_tags: list[str] = Field(default_factory=list)

log = logging.getLogger("blog")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text[:200] or "post"


# ============================================================
# PUBLIC blog
# ============================================================
blog_public_router = APIRouter(prefix="/blog", tags=["blog-public"])


@blog_public_router.get("")
async def list_published(
    db: AsyncIOMotorDatabase = Depends(get_db),
    tag: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"published": True}
    if tag:
        query["tags"] = tag
    docs = (
        await db.blog_posts.find(query, {"_id": 0, "body": 0})
        .sort("published_at", -1)
        .to_list(limit)
    )
    return [serialize_doc(d) for d in docs]


@blog_public_router.get("/{slug}")
async def get_published(
    slug: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.blog_posts.find_one(
        {"slug": slug, "published": True}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Post not found")
    # increment views non-blocking
    await db.blog_posts.update_one({"slug": slug}, {"$inc": {"views": 1}})
    return serialize_doc(doc)


# ============================================================
# ADMIN blog (auth required)
# ============================================================
blog_admin_router = APIRouter(
    prefix="/admin/blog",
    tags=["blog-admin"],
    dependencies=[Depends(get_current_user)],
)


@blog_admin_router.get("")
async def admin_list(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.blog_posts.find({}, {"_id": 0})
        .sort("updated_at", -1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


@blog_admin_router.get("/{post_id}")
async def admin_get(
    post_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return serialize_doc(doc)


@blog_admin_router.post("")
async def admin_create(
    req: BlogPostCreate, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    slug = _slugify(req.slug or req.title)
    # ensure unique slug
    if await db.blog_posts.find_one({"slug": slug}):
        raise HTTPException(409, f"Slug '{slug}' already in use")
    post = BlogPost(**{**req.model_dump(), "slug": slug})
    if post.published and not post.published_at:
        post.published_at = _now()
    await db.blog_posts.insert_one(prepare_for_mongo(post.model_dump()))
    return serialize_doc(post.model_dump())


@blog_admin_router.patch("/{post_id}")
async def admin_update(
    post_id: str,
    req: BlogPostUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    existing = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if "slug" in update:
        update["slug"] = _slugify(update["slug"])
        # uniqueness check
        clash = await db.blog_posts.find_one(
            {"slug": update["slug"], "id": {"$ne": post_id}}
        )
        if clash:
            raise HTTPException(409, "Slug already in use")
    # toggle published_at when transitioning unpublished → published
    if "published" in update:
        if update["published"] and not existing.get("published_at"):
            update["published_at"] = _now().isoformat()
        if not update["published"]:
            update["published_at"] = None
    update["updated_at"] = _now().isoformat()
    await db.blog_posts.update_one(
        {"id": post_id}, {"$set": prepare_for_mongo(update)}
    )
    fresh = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    return serialize_doc(fresh)


@blog_admin_router.delete("/{post_id}")
async def admin_delete(
    post_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.blog_posts.delete_one({"id": post_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@blog_admin_router.post("/ai/draft")
async def admin_ai_draft(
    req: BlogDraftPromptRequest, request: Request
) -> Dict[str, Any]:
    """Generate a markdown draft via OpenRouter."""
    openrouter = request.app.state.openrouter
    prompt = _draft_prompt(req)
    try:
        text = await openrouter.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Bloom Labs's senior content strategist. Write authoritative, "
                        "founder-friendly markdown blog drafts. Use H2/H3 for structure, short "
                        "punchy paragraphs, occasional callouts in blockquotes, and one CTA at "
                        "the end. NEVER use emoji. Tone: confident, technical-yet-clear, no "
                        "fluff."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=2400,
            temperature=0.75,
        )
        if not text:
            raise HTTPException(502, "AI returned empty draft")
        # Best-effort: extract title from first H1/H2
        title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        suggested_title = title_match.group(1).strip() if title_match else f"{req.topic[:80]} — Bloom Labs"
        excerpt_match = re.search(r"^(?!#)([^\n]{40,220})", text, re.MULTILINE)
        excerpt = excerpt_match.group(1).strip() if excerpt_match else ""
        return {
            "title": suggested_title,
            "slug": _slugify(suggested_title),
            "excerpt": excerpt,
            "body": text,
            "tags": [t.strip() for t in (req.angle or "").split(",") if t.strip()],
        }
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Blog AI draft failed")
        raise HTTPException(502, f"AI generation failed: {exc}")


@blog_admin_router.post("/ai/seo-suggest")
async def admin_ai_seo_suggest(
    req: BlogSeoSuggestRequest, request: Request
) -> Dict[str, Any]:
    """Analyse a draft post and return optimised SEO metadata + structured
    suggestions powered by OpenRouter (Claude Sonnet 4.5)."""
    openrouter = request.app.state.openrouter
    # Trim very long bodies so we don't blow the context window
    body_excerpt = (req.body or "")[:6000]
    user_prompt = (
        "Analyse the blog post below and return optimised SEO metadata as JSON.\n\n"
        f"Title: {req.title}\n"
        f"Current slug: {req.current_slug or '(none)'}\n"
        f"Current tags: {', '.join(req.current_tags) if req.current_tags else '(none)'}\n\n"
        "Body (markdown, may be truncated):\n"
        "```\n"
        f"{body_excerpt}\n"
        "```\n\n"
        "Return ONLY a valid JSON object with these exact keys:\n"
        "{\n"
        '  "seo_title": "55-60 char optimised title with primary keyword near the start",\n'
        '  "seo_description": "150-158 char meta description, action-led, no fluff",\n'
        '  "slug": "kebab-case-slug-3-to-6-words, primary keyword first",\n'
        '  "primary_keyword": "the single highest-intent keyword the post targets",\n'
        '  "secondary_keywords": ["3-5 related long-tail keywords"],\n'
        '  "tags": ["4-6 short topical tags"],\n'
        '  "og_image_prompt": "1-sentence prompt to generate a hero OG image (1200x630)",\n'
        '  "internal_link_suggestions": [\n'
        '     {"anchor": "anchor text", "target": "/path/on/bybloomlabs.com", "reason": "why"}\n'
        "  ],\n"
        '  "faq_schema": [\n'
        '     {"q": "Question that matches search intent", "a": "Concise 2-3 sentence answer"}\n'
        "  ]\n"
        "}\n"
        "Constraints: 3-5 internal_link_suggestions, 3-5 FAQ items. Anchors must "
        "sound natural, not keyword-stuffed. Output JSON only, no prose, no fences."
    )
    try:
        text = await openrouter.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior technical SEO strategist working on "
                        "bybloomlabs.com (an AI-native custom web app development "
                        "agency targeting SaaS founders, gym/clinic owners, and "
                        "agency operators). You return only valid JSON, never "
                        "prose. Optimise for E-E-A-T and search intent, not "
                        "keyword density."
                    ),
                },
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1800,
            temperature=0.25,
        )
        if not text:
            raise HTTPException(502, "AI returned empty response")
        import json as _json

        # Strip code fences if Claude wraps the JSON
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.DOTALL)
        try:
            data = _json.loads(cleaned)
        except Exception:
            # Last-resort: extract the first {...} block
            m = re.search(r"\{[\s\S]*\}", cleaned)
            if not m:
                raise HTTPException(502, "AI did not return valid JSON")
            data = _json.loads(m.group(0))
        # Normalise + clamp lengths
        data["seo_title"] = (data.get("seo_title") or "")[:70]
        data["seo_description"] = (data.get("seo_description") or "")[:170]
        data["slug"] = _slugify(data.get("slug") or req.current_slug or req.title)
        data["tags"] = [t for t in (data.get("tags") or []) if isinstance(t, str)][:8]
        data["secondary_keywords"] = [
            k for k in (data.get("secondary_keywords") or []) if isinstance(k, str)
        ][:6]
        data["internal_link_suggestions"] = [
            x for x in (data.get("internal_link_suggestions") or []) if isinstance(x, dict)
        ][:6]
        data["faq_schema"] = [
            x for x in (data.get("faq_schema") or []) if isinstance(x, dict)
        ][:6]
        return data
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Blog SEO suggest failed")
        raise HTTPException(502, f"AI suggestion failed: {exc}")


def _draft_prompt(req: BlogDraftPromptRequest) -> str:
    length_map = {
        "short": "800-1100 words",
        "medium": "1200-1800 words",
        "long": "2000-2800 words",
    }
    length = length_map.get(req.target_length, length_map["medium"])
    angle = req.angle or "practical insights from running an AI-native dev agency"
    audience = req.audience or "SaaS founders and agency operators"
    return (
        f"Write a {length} markdown blog post for Bloom Labs (bybloomlabs.com).\n\n"
        f"Topic: {req.topic}\n"
        f"Angle: {angle}\n"
        f"Audience: {audience}\n\n"
        "Requirements:\n"
        "1. Start with a single H1 (# Title).\n"
        "2. First paragraph hooks the reader with a specific problem or stat.\n"
        "3. Use H2 sections + occasional H3 subsections.\n"
        "4. Include 1-2 concrete examples or mini case studies.\n"
        "5. End with a 'What this means for you' section + a CTA inviting a discovery call at https://bybloomlabs.com (no fake stats).\n"
        "6. Pure markdown, no HTML.\n"
    )
