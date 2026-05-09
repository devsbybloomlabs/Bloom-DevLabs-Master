"""AI prompt orchestration for Bloom Labs admin dashboard."""
from __future__ import annotations

import json
from datetime import date as date_cls, datetime, timezone
from typing import Any, Dict, List

from openrouter_client import OpenRouterClient


ROUTINE_SYSTEM = (
    "You are an executive assistant for Ryan Salvador, founder of Bloom Labs "
    "(an AI-native web app development agency targeting SaaS founders and "
    "business owners in Asia). Your job: generate a focused, ambitious 1-day "
    "work plan that drives revenue toward a $90K target.\n\n"
    "Output STRICT JSON only. Schema: \n"
    "{\n  \"date\": \"YYYY-MM-DD\",\n"
    "  \"summary\": \"<1-line motivating intro>\",\n"
    "  \"blocks\": [{\n"
    "      \"start\": \"HH:MM\",\n"
    "      \"end\": \"HH:MM\",\n"
    "      \"type\": \"OUTREACH|CONTENT|LUNCH|CALLS|CLIENT_MGMT\",\n"
    "      \"title\": \"<specific actionable task, max 12 words>\",\n"
    "      \"description\": \"<1 sentence why this matters, max 25 words>\",\n"
    "      \"checklist\": [\"<atomic step 1>\", \"<atomic step 2>\", \"<atomic step 3>\", \"<atomic step 4>\"],\n"
    "      \"ai_prompt\": \"<short, single-sentence prompt to feed to an LLM>\",\n"
    "      \"estimate_minutes\": <int 30-60>\n"
    "  }]\n}\n\n"
    "Rules:\n"
    "- Use these 7 blocks IN ORDER: 10:00-11:00 OUTREACH, 11:00-12:00 CONTENT, "
    "12:00-13:00 LUNCH, 13:00-14:00 CALLS, 14:00-15:00 OUTREACH, "
    "15:00-16:00 CONTENT, 16:00-17:00 CLIENT_MGMT.\n"
    "- Each task must be SPECIFIC (mention numbers, channels, persona).\n"
    "- Checklist items must be 4 ATOMIC steps, max 15 words each.\n"
    "- ai_prompt must be ONE sentence, max 25 words.\n"
    "- LUNCH block: title 'Lunch + buffer', one checklist item.\n"
    "- KEEP DESCRIPTIONS SHORT to fit within token budget.\n"
    "- Return ONLY the JSON, no commentary, no markdown fences."
)


OUTREACH_SYSTEM = (
    "You are an outreach copywriter. Generate personalized cold outreach "
    "openers for Bloom Labs (AI-native web app dev agency, 4-week builds, "
    "40% lower cost than agencies). Output strict JSON."
)

CONTENT_SYSTEM = (
    "You are a LinkedIn growth copywriter for Ryan Salvador, founder of "
    "Bloom Labs. Generate authority-building content that educates and "
    "converts decision-makers (SaaS founders, business owners). Output strict JSON."
)

DISCOVERY_SYSTEM = (
    "You are a sales coach preparing a 45-minute discovery call. Generate "
    "a brief Ryan can use during the call. Output strict JSON."
)


async def generate_routine(
    or_client: OpenRouterClient,
    *,
    target_date: str,
    pipeline_summary: str = "",
    yesterday_summary: str = "",
    extra_context: str = "",
) -> Dict[str, Any]:
    user_prompt = (
        f"Generate the routine for {target_date}.\n\n"
        f"Pipeline snapshot: {pipeline_summary or 'No prospects logged yet.'}\n"
        f"Yesterday: {yesterday_summary or 'No data yet.'}\n"
        f"Extra context: {extra_context or '(none)'}"
    )
    payload = await or_client.chat_json(
        messages=[
            {"role": "system", "content": ROUTINE_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.55,
        max_tokens=4000,
    )
    return payload


async def generate_outreach_openers(
    or_client: OpenRouterClient,
    *,
    niche: str,
    pain_point: str,
    angle: str,
    count: int = 10,
) -> Dict[str, Any]:
    user_prompt = (
        f"Generate {count} personalized cold outreach messages.\n"
        f"Niche: {niche}\nPain point: {pain_point}\nOur angle: {angle}\n\n"
        "Return JSON with this shape:\n"
        "{\n  \"openers\": [\n    {\"hook\": \"...\", \"pain_reference\": \"...\", \"solution_tease\": \"...\", \"cta\": \"...\", \"channel\": \"linkedin|email\"},\n    ...\n  ],\n  \"best_time_to_send\": \"<advice>\",\n  \"estimated_response_rate\": \"<%>\",\n  \"tip\": \"<one-line tip>\"\n}\n"
        "Make each opener feel hand-written, NOT templated. Use specific industry references."
    )
    return await or_client.chat_json(
        messages=[
            {"role": "system", "content": OUTREACH_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.8,
        max_tokens=2200,
    )


async def generate_content_post(
    or_client: OpenRouterClient,
    *,
    topic: str,
    type_: str,
    format_: str,
    length: str,
) -> Dict[str, Any]:
    user_prompt = (
        f"Generate a LinkedIn {type_.replace('_',' ')} post.\n"
        f"Topic: {topic}\nFormat: {format_}\nLength: {length}\n\n"
        "Return JSON:\n"
        "{\n  \"hook\": \"<scroll-stopping line>\",\n"
        "  \"body\": \"<the post body, 5-12 lines>\",\n"
        "  \"cta\": \"<one-line call to action>\",\n"
        "  \"hashtags\": [\"#tag1\", ...],\n"
        "  \"video_script\": \"<60-sec video script>\",\n"
        "  \"visual_direction\": \"<b-roll, on-camera, text overlays, music>\",\n"
        "  \"carousel_slides\": [\"slide 1 text\", \"slide 2 text\", ...]\n"
        "}\n"
        "Lead with business value, not technical jargon."
    )
    return await or_client.chat_json(
        messages=[
            {"role": "system", "content": CONTENT_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.75,
        max_tokens=2200,
    )


async def generate_discovery_brief(
    or_client: OpenRouterClient,
    *,
    industry: str,
    pain_point: str,
    timeline: str = "",
    budget: str = "",
) -> Dict[str, Any]:
    user_prompt = (
        f"Industry: {industry}\nPain point: {pain_point}\n"
        f"Timeline: {timeline or 'unknown'}\nBudget: {budget or 'unknown'}\n\n"
        "Return JSON:\n"
        "{\n  \"qualifying_questions\": [\"q1\", ... 5 total],\n"
        "  \"relevant_case_studies\": [\"name + 1-line summary\", ...],\n"
        "  \"objection_handlers\": [{\"objection\": \"...\", \"response\": \"...\"}, ...],\n"
        "  \"timeline_expectation\": \"...\",\n"
        "  \"upsell_opportunities\": [\"...\", ...]\n"
        "}\n"
    )
    return await or_client.chat_json(
        messages=[
            {"role": "system", "content": DISCOVERY_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.6,
        max_tokens=1600,
    )


def fallback_routine(target_date: str) -> Dict[str, Any]:
    """Static fallback if OpenRouter is unavailable."""
    return {
        "date": target_date,
        "summary": "Default routine — LLM unavailable. Customize as needed.",
        "blocks": [
            {
                "start": "10:00",
                "end": "11:00",
                "type": "OUTREACH",
                "title": "Personalized LinkedIn outreach (10 prospects)",
                "description": "Build pipeline for the day.",
                "checklist": [
                    "Identify 10 SaaS founder prospects",
                    "Write 3 personalized opener angles",
                    "Send 10 messages",
                    "Log responses",
                ],
                "ai_prompt": "Write a personalized LinkedIn opener for a SaaS founder.",
                "estimate_minutes": 50,
            },
            {
                "start": "11:00",
                "end": "12:00",
                "type": "CONTENT",
                "title": "LinkedIn authority post",
                "description": "Educate market on AI-native development.",
                "checklist": [
                    "Pick angle (case study, problem/solution, tip)",
                    "Draft post",
                    "Record short video",
                    "Schedule on Followr",
                ],
                "ai_prompt": "Write a LinkedIn post about AI-native web development.",
                "estimate_minutes": 50,
            },
            {
                "start": "12:00",
                "end": "13:00",
                "type": "LUNCH",
                "title": "Lunch + buffer",
                "description": "Recharge.",
                "checklist": ["Eat real food, no screens."],
                "ai_prompt": None,
                "estimate_minutes": 60,
            },
            {
                "start": "13:00",
                "end": "14:00",
                "type": "CALLS",
                "title": "Discovery calls",
                "description": "Convert interest into proposals.",
                "checklist": [
                    "Review pre-call brief",
                    "Run discovery (45 min)",
                    "Send recap + proposal commitment",
                ],
                "ai_prompt": "Generate discovery call talking points.",
                "estimate_minutes": 60,
            },
            {
                "start": "14:00",
                "end": "15:00",
                "type": "OUTREACH",
                "title": "Phone calls / warm intros",
                "description": "Use BNI / referral network.",
                "checklist": [
                    "Call 5 warm intros",
                    "Send 5 follow-up emails",
                    "Update CRM",
                ],
                "ai_prompt": "Write a 90-second phone pitch.",
                "estimate_minutes": 50,
            },
            {
                "start": "15:00",
                "end": "16:00",
                "type": "CONTENT",
                "title": "Case study highlight",
                "description": "Turn project results into proof.",
                "checklist": [
                    "Pull case study data",
                    "Write transformation story",
                    "Record video walkthrough",
                    "Post + engage",
                ],
                "ai_prompt": "Write a case study post for a SaaS founder client.",
                "estimate_minutes": 50,
            },
            {
                "start": "16:00",
                "end": "17:00",
                "type": "CLIENT_MGMT",
                "title": "Client management",
                "description": "Close loops.",
                "checklist": [
                    "Review pipeline",
                    "Send follow-up emails to warm leads",
                    "Track payments / contracts",
                ],
                "ai_prompt": None,
                "estimate_minutes": 50,
            },
        ],
    }
