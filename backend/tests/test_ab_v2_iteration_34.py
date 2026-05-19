"""Iteration 34 — A/B Testing v2 + Bing IndexNow + Blog SEO Suggest.

Covers:
  - /api/admin/ab/v2/* (registry, create, launch, pause, complete, stats,
    apply-winner, summary, list, delete, generate) — AI generate hits live LLM
  - /api/public/ab/v2/* (assign, track) — public, no auth
  - /api/admin/blog/ai/seo-suggest — live LLM
  - /api/admin/integrations/bing_webmaster/test — IndexNow live ping

Cleanup: all created tests are deleted in teardown.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

_raw_base = os.environ.get("REACT_APP_BACKEND_URL")
if not _raw_base:
    # Fall back to frontend/.env (test runner may not export it)
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    _raw_base = _line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
assert _raw_base, "REACT_APP_BACKEND_URL not set"
BASE_URL = _raw_base.rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token field in {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_test_ids():
    ids: list[str] = []
    yield ids
    # cleanup
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=20,
        )
        tok = r.json().get("token") or r.json().get("access_token")
        for tid in ids:
            requests.delete(
                f"{BASE_URL}/api/admin/ab/v2/{tid}",
                headers={"Authorization": f"Bearer {tok}"},
                timeout=10,
            )
    except Exception as e:
        print(f"cleanup failed: {e}")


# --------------------------------------------------------------------------
# A/B v2 — auth + registry
# --------------------------------------------------------------------------
class TestRegistry:
    def test_registry_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/ab/v2/registry", timeout=10)
        assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"

    def test_registry_returns_pages_and_element_types(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/registry", headers=auth_headers, timeout=10
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pages" in data and "element_types" in data
        assert isinstance(data["pages"], list) and len(data["pages"]) >= 5
        slugs = {p["slug"] for p in data["pages"]}
        # Targeted pages from PRD
        for s in ("/", "/pricing", "/gym-owners", "/clinics-wellness", "/how-it-works"):
            assert s in slugs, f"missing page slug {s}"
        et_keys = {e["key"] for e in data["element_types"]}
        assert {"headline", "cta", "subheadline"}.issubset(et_keys)


# --------------------------------------------------------------------------
# CRUD + lifecycle
# --------------------------------------------------------------------------
class TestAbLifecycle:
    element_key_a = f"test_iter34_{uuid.uuid4().hex[:8]}"
    element_key_b = f"test_iter34_{uuid.uuid4().hex[:8]}"

    def _create_payload(self, element_key: str, name: str = "TEST_iter34_basic"):
        return {
            "name": name,
            "page_slug": "/pricing",
            "element_type": "cta",
            "element_key": element_key,
            "hypothesis": "Shorter CTA wins",
            "duration_days": 7,
            "variants": [
                {"key": "ctrl", "label": "Control", "content": "Start now", "weight": 50},
                {"key": "varA", "label": "Variation A", "content": "Get started free", "weight": 50},
            ],
        }

    def test_create_draft(self, auth_headers, created_test_ids):
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2",
            headers=auth_headers,
            json=self._create_payload(self.element_key_a),
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["status"] == "draft"
        assert data["element_key"] == self.element_key_a
        assert len(data["variants"]) == 2
        assert "id" in data
        created_test_ids.append(data["id"])
        # store for later
        pytest.test_id_a = data["id"]

    def test_get_test(self, auth_headers):
        tid = pytest.test_id_a
        r = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        )
        assert r.status_code == 200
        assert r.json()["id"] == tid

    def test_launch(self, auth_headers):
        tid = pytest.test_id_a
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/launch",
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # verify via GET
        g = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        ).json()
        assert g["status"] == "active"
        assert g["started_at"] and g["ends_at"]

    def test_element_key_uniqueness_returns_409(self, auth_headers, created_test_ids):
        # Try creating another active test with same element_key
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2",
            headers=auth_headers,
            json=self._create_payload(
                self.element_key_a, name="TEST_iter34_clash"
            ),
            timeout=15,
        )
        # create draft is OK, clash only checked on creation against active
        # Looking at code: clash check happens at create time regardless of new doc status.
        assert r.status_code == 409, f"expected 409 clash, got {r.status_code} {r.text}"

    def test_pause_and_resume(self, auth_headers):
        tid = pytest.test_id_a
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/pause",
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 200
        g = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        ).json()
        assert g["status"] == "paused"
        # Resume via launch
        r2 = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/launch",
            headers=auth_headers,
            timeout=10,
        )
        assert r2.status_code == 200
        g2 = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        ).json()
        assert g2["status"] == "active"


# --------------------------------------------------------------------------
# Public assign + track + stats
# --------------------------------------------------------------------------
class TestAssignAndTrack:
    def test_assign_no_active(self):
        r = requests.get(
            f"{BASE_URL}/api/public/ab/v2/assign/does_not_exist_xyz",
            params={"visitor_id": "vis_" + uuid.uuid4().hex},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json() == {"active": False} or r.json().get("active") is False

    def test_assign_active(self):
        ek = TestAbLifecycle.element_key_a
        r = requests.get(
            f"{BASE_URL}/api/public/ab/v2/assign/{ek}",
            params={"visitor_id": "vis_" + uuid.uuid4().hex},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("active") is True
        assert data["variant_key"] in ("ctrl", "varA")
        assert "content" in data and data["content"]
        pytest.assigned_variant = data["variant_key"]

    def test_assign_deterministic(self):
        ek = TestAbLifecycle.element_key_a
        vid = "vis_deterministic_test"
        r1 = requests.get(
            f"{BASE_URL}/api/public/ab/v2/assign/{ek}",
            params={"visitor_id": vid},
            timeout=10,
        ).json()
        r2 = requests.get(
            f"{BASE_URL}/api/public/ab/v2/assign/{ek}",
            params={"visitor_id": vid},
            timeout=10,
        ).json()
        assert r1["variant_key"] == r2["variant_key"]

    def test_track_events(self):
        tid = pytest.test_id_a
        # Push some events: 60 page_views, varied conversions to make stats computable
        for i in range(40):
            requests.post(
                f"{BASE_URL}/api/public/ab/v2/track",
                json={
                    "test_id": tid,
                    "variant_key": "ctrl",
                    "kind": "page_view",
                    "visitor_id": f"vis_ctrl_{i}",
                },
                timeout=5,
            )
        for i in range(40):
            requests.post(
                f"{BASE_URL}/api/public/ab/v2/track",
                json={
                    "test_id": tid,
                    "variant_key": "varA",
                    "kind": "page_view",
                    "visitor_id": f"vis_varA_{i}",
                },
                timeout=5,
            )
        # Conversions: 4 control, 12 variation -> ~big lift
        for i in range(4):
            requests.post(
                f"{BASE_URL}/api/public/ab/v2/track",
                json={
                    "test_id": tid,
                    "variant_key": "ctrl",
                    "kind": "conversion",
                    "visitor_id": f"vis_ctrl_{i}",
                },
                timeout=5,
            )
        for i in range(12):
            r = requests.post(
                f"{BASE_URL}/api/public/ab/v2/track",
                json={
                    "test_id": tid,
                    "variant_key": "varA",
                    "kind": "conversion",
                    "visitor_id": f"vis_varA_{i}",
                },
                timeout=5,
            )
            assert r.status_code == 200

    def test_track_invalid_kind(self):
        r = requests.post(
            f"{BASE_URL}/api/public/ab/v2/track",
            json={
                "test_id": pytest.test_id_a,
                "variant_key": "ctrl",
                "kind": "garbage",
                "visitor_id": "vis_x",
            },
            timeout=5,
        )
        assert r.status_code == 422

    def test_track_unknown_test_silent_ignore(self):
        r = requests.post(
            f"{BASE_URL}/api/public/ab/v2/track",
            json={
                "test_id": "no_such_test",
                "variant_key": "ctrl",
                "kind": "page_view",
                "visitor_id": "vis_x",
            },
            timeout=5,
        )
        assert r.status_code == 200
        assert r.json().get("ignored") == "test_not_found"

    def test_stats_aggregation(self, auth_headers):
        tid = pytest.test_id_a
        time.sleep(0.4)  # ensure writes flushed
        r = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/stats",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "per_variant" in data and len(data["per_variant"]) == 2
        by_key = {row["variant_key"]: row for row in data["per_variant"]}
        assert by_key["ctrl"]["page_views"] == 40
        assert by_key["varA"]["page_views"] == 40
        assert by_key["ctrl"]["conversions"] == 4
        assert by_key["varA"]["conversions"] == 12
        # varA is non-control => should have p_value + lift
        assert by_key["varA"]["p_value"] is not None
        assert by_key["varA"]["lift_pct"] > 100  # 4/40=10%, 12/40=30%, 200% lift
        assert "daily" in data
        assert "pct_complete" in data


# --------------------------------------------------------------------------
# Complete / apply-winner / summary / list
# --------------------------------------------------------------------------
class TestCompleteAndApply:
    def test_complete(self, auth_headers):
        tid = pytest.test_id_a
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/complete",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # With 10% vs 30%, p_value should be well below 0.05
        assert data["winner_variant_key"] == "varA", f"expected varA winner, got {data}"
        assert data["p_value"] is not None and data["p_value"] <= 0.05

    def test_apply_winner(self, auth_headers):
        tid = pytest.test_id_a
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/apply-winner",
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["winning_content"] == "Get started free"
        # Test should now be archived
        g = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        ).json()
        assert g["status"] == "archived"

    def test_apply_winner_without_winner_409(self, auth_headers, created_test_ids):
        # Create a fresh draft test and immediately try apply-winner
        payload = {
            "name": "TEST_iter34_no_winner",
            "page_slug": "/",
            "element_type": "headline",
            "element_key": f"test_iter34_nowin_{uuid.uuid4().hex[:6]}",
            "variants": [
                {"key": "c", "label": "Control", "content": "Hi", "weight": 50},
                {"key": "a", "label": "Var", "content": "Hello", "weight": 50},
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2",
            headers=auth_headers,
            json=payload,
            timeout=10,
        )
        assert r.status_code in (200, 201)
        tid = r.json()["id"]
        created_test_ids.append(tid)
        r2 = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/{tid}/apply-winner",
            headers=auth_headers,
            timeout=10,
        )
        assert r2.status_code == 409

    def test_summary(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/summary", headers=auth_headers, timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("active_tests", "tests_this_month", "avg_conversion_lift_pct", "best_test"):
            assert k in data

    def test_list_and_filter(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/ab/v2", headers=auth_headers, timeout=10
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # filter
        r2 = requests.get(
            f"{BASE_URL}/api/admin/ab/v2",
            headers=auth_headers,
            params={"status": "archived"},
            timeout=10,
        )
        assert r2.status_code == 200
        for t in r2.json():
            assert t["status"] == "archived"
        # invalid filter
        r3 = requests.get(
            f"{BASE_URL}/api/admin/ab/v2",
            headers=auth_headers,
            params={"status": "bogus"},
            timeout=10,
        )
        assert r3.status_code == 422

    def test_delete_cascades(self, auth_headers, created_test_ids):
        # Use the archived test
        tid = pytest.test_id_a
        r = requests.delete(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        )
        assert r.status_code == 200
        # verify gone
        g = requests.get(
            f"{BASE_URL}/api/admin/ab/v2/{tid}", headers=auth_headers, timeout=10
        )
        assert g.status_code == 404
        if tid in created_test_ids:
            created_test_ids.remove(tid)


# --------------------------------------------------------------------------
# AI generate — live LLM call (slow, costs tokens) — single call only
# --------------------------------------------------------------------------
class TestAiGenerate:
    def test_generate_variations(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/ab/v2/generate",
            headers=auth_headers,
            json={
                "page_slug": "/pricing",
                "element_type": "cta",
                "current_content": "Start your free trial",
                "context": "Pricing page primary CTA above the fold.",
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "variations" in data
        assert isinstance(data["variations"], list)
        assert 1 <= len(data["variations"]) <= 5
        for v in data["variations"]:
            assert "label" in v and "content" in v and v["content"].strip()
            assert "key" in v


# --------------------------------------------------------------------------
# Blog SEO suggest — live LLM call
# --------------------------------------------------------------------------
class TestBlogSeoSuggest:
    def test_seo_suggest(self, auth_headers):
        body = (
            "# AI-Native Web Apps in 21 Days\n\n"
            "Bloom Labs ships production-grade custom web apps for SaaS founders "
            "in just 21 days using an AI-native development workflow. We combine "
            "Claude, GPT, and Cursor with a senior eng team to compress months of "
            "build into weeks.\n\n## How it works\n\nKickoff Monday, code Tuesday, "
            "demo Friday. Repeat for three weeks. Ship.\n\n## Who it's for\n\n"
            "Founders who need a production-grade MVP yesterday, gym owners "
            "digitising bookings, and agencies productising their service."
        )
        r = requests.post(
            f"{BASE_URL}/api/admin/blog/ai/seo-suggest",
            headers=auth_headers,
            json={
                "title": "AI-Native Web Apps in 21 Days",
                "body": body,
                "current_slug": "ai-native-web-apps",
                "current_tags": ["ai", "web-apps"],
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Required keys
        for k in (
            "seo_title",
            "seo_description",
            "slug",
            "primary_keyword",
            "secondary_keywords",
            "tags",
            "og_image_prompt",
            "internal_link_suggestions",
            "faq_schema",
        ):
            assert k in data, f"missing key {k}"
        # Length caps
        assert len(data["seo_title"]) <= 70
        assert len(data["seo_description"]) <= 170
        assert isinstance(data["secondary_keywords"], list)
        assert isinstance(data["tags"], list)
        assert isinstance(data["internal_link_suggestions"], list)
        assert isinstance(data["faq_schema"], list)


# --------------------------------------------------------------------------
# Bing Webmaster / IndexNow
# --------------------------------------------------------------------------
class TestBingIndexNow:
    def test_bing_returns_mock_when_no_key(self, auth_headers):
        """If no API key is saved this should return ok:false + mode:'mock'.
        If a real key IS saved the endpoint hits api.indexnow.org and returns
        mode:'live'. Either behaviour is correct — we just validate the
        response shape and that we never return a 500."""
        r = requests.post(
            f"{BASE_URL}/api/admin/integrations/bing_webmaster/test",
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data and "mode" in data
        assert data["mode"] in ("mock", "live")
        if data["mode"] == "mock":
            assert data["ok"] is False
            assert "reason" in data
        else:
            # live mode — should have status + detail
            assert "status" in data and "detail" in data
            assert "key_location" in data


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
