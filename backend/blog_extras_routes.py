"""Blog RSS feed + dynamic OG card generator (SVG-based, dependency-free)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict
from xml.sax.saxutils import escape as _esc

from fastapi import APIRouter, Depends, Request, Response, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

log_prefix = "blog_extras"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


blog_extras_router = APIRouter(tags=["blog-extras"])


@blog_extras_router.get("/blog/rss.xml")
async def blog_rss(request: Request) -> Response:
    db = get_db(request)
    base = "https://bybloomlabs.com"
    posts = (
        await db.blog_posts.find({"published": True}, {"_id": 0})
        .sort("published_at", -1)
        .to_list(50)
    )
    items_xml = []
    for p in posts:
        pub = p.get("published_at") or p.get("created_at") or datetime.now(timezone.utc).isoformat()
        # RFC 822 date
        try:
            dt = datetime.fromisoformat(pub.replace("Z", "+00:00")) if isinstance(pub, str) else pub
        except Exception:
            dt = datetime.now(timezone.utc)
        rfc = dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
        link = f"{base}/blog/{p['slug']}"
        items_xml.append(
            f"""    <item>
      <title>{_esc(p.get('title', ''))}</title>
      <link>{link}</link>
      <guid isPermaLink="true">{link}</guid>
      <description>{_esc(p.get('excerpt', ''))}</description>
      <pubDate>{rfc}</pubDate>
      <author>hello@bybloomlabs.com ({_esc(p.get('author_name', 'Bloom Labs'))})</author>
    </item>"""
        )
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Bloom Labs — Blog</title>
    <link>{base}/blog</link>
    <atom:link href="{base}/api/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Field notes from shipping AI-native systems.</description>
    <language>en-us</language>
    <lastBuildDate>{datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")}</lastBuildDate>
{chr(10).join(items_xml)}
  </channel>
</rss>"""
    return Response(content=xml, media_type="application/rss+xml")


@blog_extras_router.get("/og/blog/{slug}.svg")
async def blog_og_svg(slug: str, request: Request) -> Response:
    """Generate an SVG OG card for a blog post. Browsers + Twitter/FB
    cards understand image/svg+xml URLs and render at runtime."""
    db = get_db(request)
    post = await db.blog_posts.find_one(
        {"slug": slug, "published": True}, {"_id": 0}
    )
    if not post:
        raise HTTPException(404, "Post not found")
    title = (post.get("title") or "")[:120]
    excerpt = (post.get("excerpt") or "")[:160]
    tag = (post.get("tags") or ["Bloom Labs"])[0]

    # Smart line-break the title every ~32 chars at spaces
    title_lines = _wrap_text(title, 28)[:3]
    excerpt_lines = _wrap_text(excerpt, 50)[:2]

    title_tspans = "".join(
        f'<tspan x="80" dy="{ "0" if i == 0 else "1.1em"}">{_esc(line)}</tspan>'
        for i, line in enumerate(title_lines)
    )
    excerpt_tspans = "".join(
        f'<tspan x="80" dy="{ "0" if i == 0 else "1.4em"}">{_esc(line)}</tspan>'
        for i, line in enumerate(excerpt_lines)
    )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F172A"/>
      <stop offset="1" stop-color="#1E3A8A"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="100" r="180" fill="#3B82F6" opacity="0.15"/>
  <circle cx="100" cy="540" r="120" fill="#3B82F6" opacity="0.1"/>
  <text x="80" y="100" fill="#94A3B8" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="22" font-weight="600" letter-spacing="6">
    BLOOM LABS · {_esc(tag.upper())}
  </text>
  <text x="80" y="220" fill="#F8FAFC" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="60" font-weight="700" letter-spacing="-1">
    {title_tspans}
  </text>
  <text x="80" y="490" fill="#CBD5E1" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="28" font-weight="400">
    {excerpt_tspans}
  </text>
  <text x="80" y="580" fill="#94A3B8" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="22" font-weight="600">
    bybloomlabs.com
  </text>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


def _wrap_text(text: str, max_chars: int) -> list:
    """Naive word-wrap helper."""
    words = text.split()
    lines: list = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= max_chars:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines
