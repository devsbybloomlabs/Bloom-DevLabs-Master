"""Pydantic models for Bloom Labs admin dashboard."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return str(uuid4())


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    email: EmailStr
    name: str
    role: str = "founder"
    password_hash: str
    created_at: datetime = Field(default_factory=_now)


# ---------- Routine / Blocks ----------
class ChecklistItem(BaseModel):
    id: str = Field(default_factory=_id)
    text: str
    done: bool = False


class Block(BaseModel):
    id: str = Field(default_factory=_id)
    start: str  # "10:00"
    end: str  # "11:00"
    type: str  # OUTREACH | CONTENT | LUNCH | CALLS | CLIENT_MGMT | CUSTOM
    title: str
    description: Optional[str] = None
    checklist: List[ChecklistItem] = Field(default_factory=list)
    ai_prompt: Optional[str] = None
    estimate_minutes: Optional[int] = None
    completed: bool = False


class Routine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    date: str  # YYYY-MM-DD
    blocks: List[Block]
    generated_by_ai: bool = True
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class RoutineGenerateRequest(BaseModel):
    date: Optional[str] = None  # default today
    force: bool = False
    extra_context: Optional[str] = None


class UpdateChecklistItem(BaseModel):
    block_id: str
    item_id: str
    done: bool


# ---------- Pipeline / Prospects ----------
class Prospect(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    name: str
    company: Optional[str] = None
    email: Optional[EmailStr] = None
    linkedin: Optional[str] = None
    industry: Optional[str] = None
    source: Optional[str] = None  # tidycal, linkedin, referral, etc.
    status: str = "new"  # new | contacted | qualified | proposal | won | lost
    notes: Optional[str] = None
    deal_value: Optional[float] = None
    next_action: Optional[str] = None
    next_action_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ProspectCreate(BaseModel):
    name: str
    company: Optional[str] = None
    email: Optional[EmailStr] = None
    linkedin: Optional[str] = None
    industry: Optional[str] = None
    source: Optional[str] = "manual"
    status: str = "new"
    notes: Optional[str] = None
    deal_value: Optional[float] = None
    next_action: Optional[str] = None
    next_action_at: Optional[datetime] = None


class ProspectUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[EmailStr] = None
    linkedin: Optional[str] = None
    industry: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    deal_value: Optional[float] = None
    next_action: Optional[str] = None
    next_action_at: Optional[datetime] = None


# ---------- Content Pieces ----------
class ContentPiece(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    title: str
    type: str = "linkedin_authority"  # linkedin_authority | problem_solution | case_study | tip | bts
    body: Optional[str] = None
    video_script: Optional[str] = None
    visual_direction: Optional[str] = None
    cta: Optional[str] = None
    status: str = "draft"  # draft | scheduled | published
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    engagement: Dict[str, Any] = Field(default_factory=dict)  # impressions, clicks, comments...
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ContentPieceCreate(BaseModel):
    title: str
    type: str = "linkedin_authority"
    body: Optional[str] = None
    video_script: Optional[str] = None
    visual_direction: Optional[str] = None
    cta: Optional[str] = None
    status: str = "draft"
    scheduled_at: Optional[datetime] = None
    tags: List[str] = Field(default_factory=list)


class ContentPieceUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    body: Optional[str] = None
    video_script: Optional[str] = None
    visual_direction: Optional[str] = None
    cta: Optional[str] = None
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    engagement: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None


# ---------- AI Prompts ----------
class OutreachPromptRequest(BaseModel):
    niche: str = "SaaS founders Philippines/Singapore"
    pain_point: str = "slow expensive dev agencies"
    angle: str = "4-week builds at 40% lower cost"
    count: int = 10


class ContentPromptRequest(BaseModel):
    topic: str = "AI-native web development"
    type: str = "linkedin_authority"
    format: str = "single_post"  # single_post | carousel | video_script
    length: str = "medium"


class DiscoveryPromptRequest(BaseModel):
    industry: str
    pain_point: str
    timeline: Optional[str] = None
    budget: Optional[str] = None


# ---------- Settings ----------
class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "singleton"
    openrouter_model: str = "anthropic/claude-sonnet-4.5"
    linkedin_url: str = "https://linkedin.com/in/bybloomlabs"
    industry_targets: List[str] = Field(
        default_factory=lambda: [
            "SaaS founders",
            "Local services owners",
            "E-commerce operators",
        ]
    )
    daily_outreach_target: int = 25
    daily_calls_target: int = 3
    daily_content_pieces: int = 2
    revenue_target: float = 90000.0
    weekly_revenue_breakdown: Dict[str, float] = Field(default_factory=dict)
    available_hours: Dict[str, List[str]] = Field(
        default_factory=lambda: {
            "Mon": ["10:00-13:00", "14:00-16:00"],
            "Tue": ["10:00-13:00", "14:00-16:00"],
            "Wed": ["10:00-13:00", "14:00-16:00"],
            "Thu": ["10:00-13:00", "14:00-16:00"],
            "Fri": ["10:00-13:00", "14:00-16:00"],
        }
    )
    content_preferences: List[str] = Field(
        default_factory=lambda: [
            "linkedin_authority",
            "problem_solution",
            "case_study",
            "tip",
            "bts",
        ]
    )
    updated_at: datetime = Field(default_factory=_now)


class SettingsUpdate(BaseModel):
    openrouter_model: Optional[str] = None
    linkedin_url: Optional[str] = None
    industry_targets: Optional[List[str]] = None
    daily_outreach_target: Optional[int] = None
    daily_calls_target: Optional[int] = None
    daily_content_pieces: Optional[int] = None
    revenue_target: Optional[float] = None
    weekly_revenue_breakdown: Optional[Dict[str, float]] = None
    available_hours: Optional[Dict[str, List[str]]] = None
    content_preferences: Optional[List[str]] = None


# ---------- Daily Metric ----------
class DailyMetric(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    date: str  # YYYY-MM-DD
    outreach_done: int = 0
    outreach_target: int = 25
    calls_scheduled: int = 0
    calls_completed: int = 0
    closes: int = 0
    revenue_generated: float = 0.0
    content_pieces_published: int = 0
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class DailyMetricUpdate(BaseModel):
    outreach_done: Optional[int] = None
    outreach_target: Optional[int] = None
    calls_scheduled: Optional[int] = None
    calls_completed: Optional[int] = None
    closes: Optional[int] = None
    revenue_generated: Optional[float] = None
    content_pieces_published: Optional[int] = None
    notes: Optional[str] = None


# ---------- Case Studies ----------
class CaseStudyMetric(BaseModel):
    label: str
    before: Optional[str] = None
    after: Optional[str] = None


class CaseStudy(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_name: str
    industry: str
    challenge: str
    solution: str
    timeline_days: int
    investment: Optional[float] = None
    quote: Optional[str] = None
    quote_author: Optional[str] = None
    video_link: Optional[str] = None
    featured_image: Optional[str] = None
    metrics: List[CaseStudyMetric] = Field(default_factory=list)
    public: bool = False
    checklist: Dict[str, bool] = Field(
        default_factory=lambda: {
            "before_after_screenshots": False,
            "client_quote": False,
            "video_walkthrough": False,
            "written_writeup": False,
            "public_permission": False,
            "on_website": False,
            "linkedin_post": False,
        }
    )
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class CaseStudyCreate(BaseModel):
    client_name: str
    industry: str
    challenge: str
    solution: str
    timeline_days: int
    investment: Optional[float] = None
    quote: Optional[str] = None
    quote_author: Optional[str] = None
    video_link: Optional[str] = None
    featured_image: Optional[str] = None
    metrics: List[CaseStudyMetric] = Field(default_factory=list)
    public: bool = False
    tags: List[str] = Field(default_factory=list)


class CaseStudyUpdate(BaseModel):
    client_name: Optional[str] = None
    industry: Optional[str] = None
    challenge: Optional[str] = None
    solution: Optional[str] = None
    timeline_days: Optional[int] = None
    investment: Optional[float] = None
    quote: Optional[str] = None
    quote_author: Optional[str] = None
    video_link: Optional[str] = None
    featured_image: Optional[str] = None
    metrics: Optional[List[CaseStudyMetric]] = None
    public: Optional[bool] = None
    checklist: Optional[Dict[str, bool]] = None
    tags: Optional[List[str]] = None


# ---------- Testimonials ----------
class Testimonial(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_name: str
    client_email: Optional[EmailStr] = None
    company: Optional[str] = None
    project: Optional[str] = None
    written: Optional[str] = None  # the testimonial text
    video_url: Optional[str] = None
    rating: Optional[int] = None  # 1-5
    permission_to_feature: bool = False
    request_sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    featured: bool = False
    status: str = "pending"  # pending | requested | received | featured
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class TestimonialCreate(BaseModel):
    client_name: str
    client_email: Optional[EmailStr] = None
    company: Optional[str] = None
    project: Optional[str] = None
    written: Optional[str] = None
    video_url: Optional[str] = None
    rating: Optional[int] = None
    permission_to_feature: bool = False
    status: str = "pending"


class TestimonialUpdate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    company: Optional[str] = None
    project: Optional[str] = None
    written: Optional[str] = None
    video_url: Optional[str] = None
    rating: Optional[int] = None
    permission_to_feature: Optional[bool] = None
    featured: Optional[bool] = None
    status: Optional[str] = None


class TestimonialRequestSend(BaseModel):
    testimonial_id: Optional[str] = None
    client_email: Optional[EmailStr] = None
    client_name: Optional[str] = None
    project: Optional[str] = None
    custom_message: Optional[str] = None


# ---------- Thought Leadership ----------
class ThoughtLeadership(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    title: str
    type: str  # blog | linkedin_article | guest_post | speaking | podcast | media_mention
    url: Optional[str] = None
    platform: Optional[str] = None
    published_at: Optional[datetime] = None
    notes: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    checklist: Dict[str, bool] = Field(
        default_factory=lambda: {
            "aligned_with_positioning": False,
            "shows_expertise": False,
            "solves_real_problem": False,
            "published": False,
            "shared_on_channels": False,
            "engagement_tracked": False,
        }
    )
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ThoughtLeadershipCreate(BaseModel):
    title: str
    type: str
    url: Optional[str] = None
    platform: Optional[str] = None
    published_at: Optional[datetime] = None
    notes: Optional[str] = None


class ThoughtLeadershipUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    platform: Optional[str] = None
    published_at: Optional[datetime] = None
    notes: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    checklist: Optional[Dict[str, bool]] = None


# ---------- Authority Metrics (manual) ----------
class AuthorityMetric(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "singleton"  # one document
    linkedin_followers: int = 0
    linkedin_engagement_rate: float = 0.0
    profile_views_weekly: int = 0
    monthly_website_visitors: int = 0
    inbound_inquiry_rate: float = 0.0
    conversion_rate: float = 0.0
    average_project_value: float = 0.0
    client_retention_rate: float = 0.0
    history: List[Dict[str, Any]] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=_now)


class AuthorityMetricUpdate(BaseModel):
    linkedin_followers: Optional[int] = None
    linkedin_engagement_rate: Optional[float] = None
    profile_views_weekly: Optional[int] = None
    monthly_website_visitors: Optional[int] = None
    inbound_inquiry_rate: Optional[float] = None
    conversion_rate: Optional[float] = None
    average_project_value: Optional[float] = None
    client_retention_rate: Optional[float] = None


# ---------- Misc ----------
class NotificationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    kind: str  # booking | close | task | system
    title: str
    body: Optional[str] = None
    read: bool = False
    link: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
