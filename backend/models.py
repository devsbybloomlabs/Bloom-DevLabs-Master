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


# ---------- Blog Posts ----------
class BlogPost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    slug: str
    title: str
    excerpt: Optional[str] = None
    body: str = ""  # markdown
    featured_image: Optional[str] = None
    og_image: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    author_name: str = "Bloom Labs"
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    published: bool = False
    published_at: Optional[datetime] = None
    views: int = 0
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class BlogPostCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    excerpt: Optional[str] = None
    body: str = ""
    featured_image: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    author_name: str = "Bloom Labs"
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    published: bool = False


class BlogPostUpdate(BaseModel):
    slug: Optional[str] = None
    title: Optional[str] = None
    excerpt: Optional[str] = None
    body: Optional[str] = None
    featured_image: Optional[str] = None
    og_image: Optional[str] = None
    tags: Optional[List[str]] = None
    author_name: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    published: Optional[bool] = None


class BlogDraftPromptRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=200)
    angle: Optional[str] = None
    target_length: str = "medium"  # short | medium | long
    audience: Optional[str] = "SaaS founders, agency operators"


# ---------- Onboarding ----------
class OnboardingDesignLink(BaseModel):
    url: str = ""
    why: str = ""


class OnboardingFunctionLink(BaseModel):
    url: str = ""
    why: str = ""


class OnboardingSuccessScenario(BaseModel):
    description: str = ""
    metric: str = ""


class OnboardingPhase1(BaseModel):
    """Design Language"""
    design_links: List[OnboardingDesignLink] = Field(default_factory=lambda: [
        OnboardingDesignLink(), OnboardingDesignLink(), OnboardingDesignLink()
    ])
    color_preferences: str = ""
    mood_keywords: str = ""


class OnboardingPhase2(BaseModel):
    """Function Language"""
    function_links: List[OnboardingFunctionLink] = Field(default_factory=lambda: [
        OnboardingFunctionLink(), OnboardingFunctionLink(), OnboardingFunctionLink()
    ])
    additional_specs: str = ""


class OnboardingPhase3(BaseModel):
    """Company Background & Kickoff"""
    project_name: str = ""
    company_story: str = ""
    goals: str = ""
    success_scenarios: List[OnboardingSuccessScenario] = Field(default_factory=lambda: [
        OnboardingSuccessScenario(), OnboardingSuccessScenario(), OnboardingSuccessScenario()
    ])
    timeline_expectation: str = ""
    budget: str = ""


class OnboardingSubmission(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_email: EmailStr
    client_name: str = ""
    client_id: Optional[str] = None
    resume_token: str = ""
    phase1: OnboardingPhase1 = Field(default_factory=OnboardingPhase1)
    phase1_submitted_at: Optional[datetime] = None
    phase2: OnboardingPhase2 = Field(default_factory=OnboardingPhase2)
    phase2_submitted_at: Optional[datetime] = None
    phase3: OnboardingPhase3 = Field(default_factory=OnboardingPhase3)
    phase3_submitted_at: Optional[datetime] = None
    current_phase: int = 1
    completed: bool = False
    # Nifty task ids created per phase (audit)
    nifty_task_ids: Dict[str, List[str]] = Field(default_factory=dict)
    nifty_errors: List[Dict[str, Any]] = Field(default_factory=list)
    ah_project_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


# ---------- Lead Magnets / Email Capture ----------
class EmailSequenceStep(BaseModel):
    """One step inside a drip email sequence."""
    day_offset: int = 0  # 0 = immediately, 3 = +3 days, etc.
    subject: str = ""
    body_markdown: str = ""


class LeadMagnet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    slug: str
    title: str  # e.g. "The Founder's AI-Native Build Playbook"
    description: str = ""
    asset_url: Optional[str] = None  # link to PDF/Notion/etc.
    cta_text: str = "Get the playbook"
    placement: str = "all"  # all | blog | blog_slug:<slug> | homepage
    placement_target: Optional[str] = None  # if placement=blog_slug, the slug
    sequence_steps: List[EmailSequenceStep] = Field(default_factory=list)
    active: bool = True
    leads_count: int = 0
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class LeadMagnetCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    asset_url: Optional[str] = None
    cta_text: str = "Get the playbook"
    placement: str = "all"
    placement_target: Optional[str] = None
    sequence_steps: List[EmailSequenceStep] = Field(default_factory=list)
    active: bool = True


class LeadMagnetUpdate(BaseModel):
    slug: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    asset_url: Optional[str] = None
    cta_text: Optional[str] = None
    placement: Optional[str] = None
    placement_target: Optional[str] = None
    sequence_steps: Optional[List[EmailSequenceStep]] = None
    active: Optional[bool] = None


class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    email: EmailStr
    name: Optional[str] = None
    magnet_id: str
    magnet_slug: str
    source_url: Optional[str] = None  # which blog post / page they came from
    utm: Dict[str, str] = Field(default_factory=dict)
    next_step_idx: int = 0  # which sequence_step is next to send
    next_send_at: Optional[datetime] = None  # when to send next step
    completed_sequence: bool = False
    unsubscribed: bool = False
    unsubscribed_at: Optional[datetime] = None
    sent_log: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)


class LeadOptInRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    magnet_slug: str
    source_url: Optional[str] = None
    utm: Optional[Dict[str, str]] = None


# ---------- Milestones (Nifty → Client Portal sync) ----------
class MilestoneNote(BaseModel):
    author: str = ""
    text: str = ""
    created_at: datetime = Field(default_factory=_now)


class Milestone(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_email: EmailStr
    project_name: str = ""
    title: str
    status: str = "pending"  # pending | in_progress | complete | blocked
    description: str = ""
    is_final_deliverable: bool = False
    notify_client_on_complete: bool = False
    nifty_task_id: Optional[str] = None
    due_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    blocked_reason: Optional[str] = None
    blocked_eta: Optional[datetime] = None
    notes: List[MilestoneNote] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=_now)
    created_at: datetime = Field(default_factory=_now)


class MilestoneCreate(BaseModel):
    client_email: EmailStr
    project_name: str = ""
    title: str
    description: str = ""
    is_final_deliverable: bool = False
    notify_client_on_complete: bool = False
    nifty_task_id: Optional[str] = None
    due_date: Optional[datetime] = None
    status: str = "pending"


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    is_final_deliverable: Optional[bool] = None
    notify_client_on_complete: Optional[bool] = None
    nifty_task_id: Optional[str] = None
    due_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    blocked_reason: Optional[str] = None
    blocked_eta: Optional[datetime] = None
