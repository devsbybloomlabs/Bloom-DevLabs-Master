"""Phase D part 3 — per-phase brief flow E2E.

Covers:
  - Per-phase status state machine (draft → sent_for_review → in_revision → approved)
  - Comment from client flips status correctly
  - Approve from client requires `no_comments_confirmed=True`
  - Approval auto-completes the matching review milestone
  - Full-brief approve refused until all 3 phases approved
  - Revision history grows on every PATCH
  - Phase lock-on-approval (PATCH rejected after approve)
  - HTML sanitisation strips script tags
  - On full approval: build milestones + Project Mode workspace seed
"""
from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

API_BASE = os.environ.get("E2E_API_BASE", "http://localhost:8001/api").rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"


def _admin_token() -> str:
    r = requests.post(
        f"{API_BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    r.raise_for_status()
    return r.json().get("access_token")


def _client_token(email: str, password: str) -> str:
    r = requests.post(
        f"{API_BASE}/clients/register",
        json={"email": email, "password": password, "name": "Per-Phase Client", "company": "Co"},
        timeout=15,
    )
    if r.status_code in (400, 409):
        r = requests.post(
            f"{API_BASE}/clients/login",
            json={"email": email, "password": password},
            timeout=15,
        )
    r.raise_for_status()
    return r.json().get("access_token")


def _drop(collection: str, query: dict) -> None:
    async def _do():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]][collection].delete_many(query)
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_do())


@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture
def setup(admin_token):
    email = f"phase-d3-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "PhaseD3Test!"
    ct = _client_token(email, password)
    A = {"Authorization": f"Bearer {admin_token}"}
    C = {"Authorization": f"Bearer {ct}"}
    r = requests.post(
        f"{API_BASE}/admin/briefs",
        json={"client_email": email, "project_name": "Acme Per-Phase Test"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    brief = r.json()
    try:
        yield {"email": email, "A": A, "C": C, "brief": brief}
    finally:
        _drop("project_briefs", {"client_email": email})
        _drop("milestones", {"client_email": email})
        _drop("pm_projects", {"client_email": email})
        _drop("pm_tasks", {"project_id": None})  # cleanup orphaned tasks
        _drop("clients", {"email": email})
        # Best-effort cleanup of approved-brief PDF
        _drop("project_files", {"client_email": email})


# -------------------------------------------------------------------------
# Per-phase state machine
# -------------------------------------------------------------------------
def test_full_state_machine(setup):
    A, C, brief = setup["A"], setup["C"], setup["brief"]
    bid = brief["id"]

    # 1. Phase summaries start as 'draft'
    for k in ("phase1", "phase2", "phase3"):
        assert brief["phase_summaries"][k]["status"] == "draft"
    assert brief["status"] == "draft"

    # 2. Save phase1 summary → still draft, but a revision is recorded
    r = requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={"summary": "<p>This is the <strong>design</strong> summary.</p>"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    p1 = r.json()["phase_summaries"]["phase1"]
    assert p1["status"] == "draft"
    assert len(p1["revisions"]) == 1
    assert "<strong>" in p1["revisions"][0]["summary"]

    # 3. HTML sanitisation strips script tags
    r = requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={"summary": "<p>Hi</p><script>alert(1)</script><p>bye</p>"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    p1 = r.json()["phase_summaries"]["phase1"]
    assert "<script>" not in p1["summary"]
    assert "<p>Hi</p>" in p1["summary"]
    assert "<p>bye</p>" in p1["summary"]

    # 4. Send phase1 for review → status=sent_for_review, brief in_review
    r = requests.post(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1/send-for-review",
        json={"note_to_client": "Take your time."},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["phase_summaries"]["phase1"]["status"] == "sent_for_review"
    assert body["status"] == "in_review"
    assert body["phase_summaries"]["phase1"]["sent_at"]

    # 5. Pending endpoint exposes the brief to the client
    r = requests.get(f"{API_BASE}/clients/me/briefs/pending", headers=C, timeout=15)
    assert r.status_code == 200
    pending = r.json()
    assert pending and pending["id"] == bid

    # 6. Sending again without saving NEW content is allowed (re-send)
    r = requests.post(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1/send-for-review",
        json={},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200

    # 7. Client leaves a comment → status=in_revision
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/phase/phase1/comment",
        json={"comment": "Can we go warmer on the accent color?"},
        headers=C,
        timeout=15,
    )
    assert r.status_code == 200
    p1 = r.json()["phase_summaries"]["phase1"]
    assert p1["status"] == "in_revision"
    assert "warmer" in p1["latest_comment"]

    # 8. Cannot comment when not in sent_for_review
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/phase/phase2/comment",
        json={"comment": "fast comment"},
        headers=C,
        timeout=15,
    )
    assert r.status_code == 409

    # 9. Admin re-rolls with admin_reply_note → another revision, status drops to draft
    r = requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={
            "summary": "<p>Updated design summary — warmer accent now.</p>",
            "admin_reply_note": "Updated based on your feedback re: warmer accent.",
        },
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    p1 = r.json()["phase_summaries"]["phase1"]
    assert p1["status"] == "draft"
    assert "warmer accent" in p1["summary"]
    assert p1["admin_reply_note"] == "Updated based on your feedback re: warmer accent."
    assert len(p1["revisions"]) >= 3  # initial + sanitised + rev after comment

    # 10. Re-send for review
    r = requests.post(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1/send-for-review",
        json={},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200

    # 11. Client must tick the checkbox to approve
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/phase/phase1/approve",
        json={"no_comments_confirmed": False},
        headers=C,
        timeout=15,
    )
    assert r.status_code == 400

    # 12. With checkbox → phase approves
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/phase/phase1/approve",
        json={"no_comments_confirmed": True},
        headers=C,
        timeout=15,
    )
    assert r.status_code == 200
    p1 = r.json()["phase_summaries"]["phase1"]
    assert p1["status"] == "approved"
    assert p1["approved_at"]

    # 13. Approved phase is locked — admin cannot PATCH
    r = requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={"summary": "<p>Trying to overwrite</p>"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 409

    # 14. Final approval refused until phase2 and phase3 also approved
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/approve", headers=C, timeout=15
    )
    assert r.status_code == 409

    # 15. Wrap up phase 2 and 3 quickly
    for k in ("phase2", "phase3"):
        requests.patch(
            f"{API_BASE}/admin/briefs/{bid}/phase/{k}",
            json={"summary": f"<p>{k} summary content.</p>"},
            headers=A,
            timeout=15,
        )
        requests.post(
            f"{API_BASE}/admin/briefs/{bid}/phase/{k}/send-for-review",
            json={},
            headers=A,
            timeout=15,
        )
        requests.post(
            f"{API_BASE}/clients/me/briefs/{bid}/phase/{k}/approve",
            json={"no_comments_confirmed": True},
            headers=C,
            timeout=15,
        )

    # 16. After 3rd phase approval, brief should be auto-finalized
    r = requests.get(f"{API_BASE}/admin/briefs/{bid}", headers=A, timeout=15)
    assert r.status_code == 200
    fresh = r.json()
    assert fresh["status"] == "approved"
    assert fresh["approved_at"]
    assert fresh["approved_by_email"] == setup["email"]

    # 17. Build milestones (5 default) were seeded
    r = requests.get(f"{API_BASE}/clients/me/milestones", headers=C, timeout=15)
    assert r.status_code == 200
    titles = [m["title"] for m in r.json()]
    for must in [
        "Discovery & Brief Sign-off",
        "Design Language",
        "Build — Core flows",
        "QA & Polish",
        "Launch",
        "Brief Review: Design Language",
    ]:
        assert must in titles, f"{must} missing from {titles}"

    # 18. Project Mode project + tasks were created (seeded in background — LLM call ~5-30s)
    import time
    matching = []
    for _ in range(100):  # poll up to 60s
        r = requests.get(
            f"{API_BASE}/admin/pm/projects?status=active",
            headers=A,
            timeout=15,
        )
        if r.status_code == 200:
            matching = [p for p in r.json() if p.get("client_email") == setup["email"]]
            if matching and matching[0].get("task_total", 0) >= 1:
                break
        time.sleep(0.6)
    assert matching, "Project Mode workspace was not seeded"
    project = matching[0]
    assert project["task_total"] >= 1, f"No tasks seeded; got {project}"


# -------------------------------------------------------------------------
# Review milestone sync — separately tested for clarity
# -------------------------------------------------------------------------
def test_review_milestone_status_sync(setup):
    A, C, brief = setup["A"], setup["C"], setup["brief"]
    bid = brief["id"]

    requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={"summary": "<p>Design summary</p>"},
        headers=A,
        timeout=15,
    )
    requests.post(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1/send-for-review",
        json={},
        headers=A,
        timeout=15,
    )

    # Milestone should exist with status "in_progress" and "Waiting for your review."
    r = requests.get(f"{API_BASE}/clients/me/milestones", headers=C, timeout=15)
    review = [m for m in r.json() if m["title"] == "Brief Review: Design Language"]
    assert len(review) == 1
    assert review[0]["status"] == "in_progress"
    assert "Waiting" in review[0]["description"]

    # Client comments → description flips
    requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/phase/phase1/comment",
        json={"comment": "Let's tweak the typography"},
        headers=C,
        timeout=15,
    )
    r = requests.get(f"{API_BASE}/clients/me/milestones", headers=C, timeout=15)
    review = [m for m in r.json() if m["title"] == "Brief Review: Design Language"]
    assert "reviewing your comments" in review[0]["description"]

    # Admin re-saves + re-sends → back to "Waiting"
    requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={"summary": "<p>v2 summary</p>"},
        headers=A,
        timeout=15,
    )
    requests.post(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1/send-for-review",
        json={},
        headers=A,
        timeout=15,
    )
    r = requests.get(f"{API_BASE}/clients/me/milestones", headers=C, timeout=15)
    review = [m for m in r.json() if m["title"] == "Brief Review: Design Language"]
    assert "Waiting" in review[0]["description"]

    # Client approves → milestone status flips to complete
    requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/phase/phase1/approve",
        json={"no_comments_confirmed": True},
        headers=C,
        timeout=15,
    )
    r = requests.get(f"{API_BASE}/clients/me/milestones", headers=C, timeout=15)
    review = [m for m in r.json() if m["title"] == "Brief Review: Design Language"]
    assert review[0]["status"] == "complete"
    assert review[0]["completion_date"]


def test_auth_guards():
    r = requests.post(
        f"{API_BASE}/admin/briefs/x/phase/phase1/send-for-review",
        json={},
        timeout=15,
    )
    assert r.status_code in (401, 403)
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/x/phase/phase1/comment",
        json={"comment": "x"},
        timeout=15,
    )
    assert r.status_code in (401, 403)
