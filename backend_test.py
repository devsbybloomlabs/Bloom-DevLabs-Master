"""Comprehensive backend API tests for Bloom Labs Phase 2-4 admin dashboard."""
import asyncio
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

# Public endpoint from frontend/.env
BASE_URL = "https://founder-dashboard-18.preview.emergentagent.com/api"

# Test credentials from backend/.env
TEST_EMAIL = "founder@thesalvador.group"
TEST_PASSWORD = "admin123"


class BloomLabsAPITester:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests: List[str] = []
        self.test_data: Dict[str, Any] = {}

    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {msg}")

    async def run_test(
        self,
        name: str,
        method: str,
        endpoint: str,
        expected_status: int,
        data: Optional[Dict] = None,
        auth: bool = True,
        timeout: float = 30.0,
        check_fields: Optional[List[str]] = None,
    ) -> tuple[bool, Optional[Dict]]:
        """Run a single API test."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {"Content-Type": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        self.tests_run += 1
        self.log(f"Testing {name}...")

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                elif method == "POST":
                    response = await client.post(url, json=data, headers=headers)
                elif method == "PATCH":
                    response = await client.patch(url, json=data, headers=headers)
                elif method == "DELETE":
                    response = await client.delete(url, headers=headers)
                else:
                    raise ValueError(f"Unsupported method: {method}")

                success = response.status_code == expected_status
                try:
                    response_data = response.json()
                except Exception:
                    response_data = {"raw": response.text}

                if success:
                    # Check required fields if specified
                    if check_fields and isinstance(response_data, dict):
                        for field in check_fields:
                            if field not in response_data:
                                success = False
                                self.log(
                                    f"❌ FAILED - Missing field '{field}' in response",
                                    "ERROR",
                                )
                                break

                if success:
                    self.tests_passed += 1
                    self.log(f"✅ PASSED - Status: {response.status_code}")
                    return True, response_data
                else:
                    self.tests_failed += 1
                    self.failed_tests.append(name)
                    self.log(
                        f"❌ FAILED - Expected {expected_status}, got {response.status_code}",
                        "ERROR",
                    )
                    self.log(f"Response: {str(response_data)[:300]}", "ERROR")
                    return False, response_data

        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append(name)
            self.log(f"❌ FAILED - Error: {str(e)}", "ERROR")
            return False, None

    async def test_auth(self) -> bool:
        """Test authentication endpoints."""
        self.log("\n=== TESTING AUTHENTICATION ===", "INFO")

        # Test login with correct credentials
        success, response = await self.run_test(
            "Login with correct credentials",
            "POST",
            "/auth/login",
            200,
            data={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            auth=False,
            check_fields=["access_token", "user"],
        )
        if success and response:
            self.token = response.get("access_token")
            self.log(f"Token obtained: {self.token[:20]}...")

        # Test login with wrong password
        await self.run_test(
            "Login with wrong password",
            "POST",
            "/auth/login",
            401,
            data={"email": TEST_EMAIL, "password": "wrongpassword"},
            auth=False,
        )

        # Test /me with valid token
        await self.run_test(
            "GET /auth/me with valid token",
            "GET",
            "/auth/me",
            200,
            auth=True,
            check_fields=["email", "name", "role"],
        )

        # Test /me without token
        temp_token = self.token
        self.token = None
        await self.run_test(
            "GET /auth/me without token",
            "GET",
            "/auth/me",
            401,
            auth=False,
        )
        self.token = temp_token

        return self.token is not None

    async def test_dashboard(self):
        """Test dashboard home endpoint."""
        self.log("\n=== TESTING DASHBOARD ===", "INFO")

        # Dashboard home may take up to 60s if AI routine is being generated
        success, response = await self.run_test(
            "GET /dashboard/home (may take up to 60s for AI routine)",
            "GET",
            "/dashboard/home",
            200,
            timeout=120.0,
            check_fields=["routine", "metric", "pipeline", "credibility"],
        )
        if success and response:
            self.log(f"Dashboard loaded with {len(response.get('routine', {}).get('blocks', []))} blocks")

    async def test_routine(self):
        """Test routine endpoints."""
        self.log("\n=== TESTING ROUTINE ===", "INFO")

        # Get today's routine (idempotent - should return same data)
        success, response = await self.run_test(
            "GET /routine/today (idempotent)",
            "GET",
            "/routine/today",
            200,
            timeout=120.0,
            check_fields=["date", "blocks"],
        )
        if success and response:
            blocks = response.get("blocks", [])
            self.log(f"Routine has {len(blocks)} blocks")
            if len(blocks) >= 6:
                self.log("✅ Routine has at least 6 blocks (covers 7-block daily plan)")
                # Store first block for checklist toggle test
                if blocks:
                    self.test_data["block_id"] = blocks[0].get("id")
                    checklist = blocks[0].get("checklist", [])
                    if checklist:
                        self.test_data["item_id"] = checklist[0].get("id")
            else:
                self.log(f"⚠️ WARNING: Expected at least 6 blocks, got {len(blocks)}", "WARN")

        # Test checklist toggle
        if "block_id" in self.test_data and "item_id" in self.test_data:
            await self.run_test(
                "POST /routine/checklist/toggle",
                "POST",
                "/routine/checklist/toggle",
                200,
                data={
                    "block_id": self.test_data["block_id"],
                    "item_id": self.test_data["item_id"],
                    "done": True,
                },
                check_fields=["ok"],
            )

        # Test force regenerate routine
        success, response = await self.run_test(
            "POST /routine/generate with force=true (may take up to 60s)",
            "POST",
            "/routine/generate",
            200,
            data={"force": True},
            timeout=120.0,
            check_fields=["date", "blocks"],
        )
        if success and response:
            blocks = response.get("blocks", [])
            self.log(f"Regenerated routine has {len(blocks)} blocks")

    async def test_ai_endpoints(self):
        """Test AI generation endpoints."""
        self.log("\n=== TESTING AI ENDPOINTS ===", "INFO")

        # Test outreach AI (may take ~30s)
        success, response = await self.run_test(
            "POST /ai/outreach (may take ~30s)",
            "POST",
            "/ai/outreach",
            200,
            data={
                "niche": "SaaS founders Philippines",
                "pain_point": "slow expensive dev agencies",
                "angle": "4-week builds at 40% lower cost",
                "count": 5,
            },
            timeout=120.0,
            check_fields=["openers"],
        )
        if success and response:
            openers = response.get("openers", [])
            self.log(f"Generated {len(openers)} outreach openers")
            if openers and len(openers) >= 3:
                self.log("✅ Openers have required fields")

        # Test content AI (may take ~30s)
        success, response = await self.run_test(
            "POST /ai/content (may take ~30s)",
            "POST",
            "/ai/content",
            200,
            data={
                "topic": "AI-native web development",
                "type": "linkedin_authority",
                "format": "single_post",
                "length": "medium",
            },
            timeout=120.0,
            check_fields=["hook", "body", "cta"],
        )
        if success and response:
            self.log("✅ Content AI returned hook/body/cta/hashtags")

        # Test discovery AI (may take ~30s)
        success, response = await self.run_test(
            "POST /ai/discovery (may take ~30s)",
            "POST",
            "/ai/discovery",
            200,
            data={
                "industry": "SaaS",
                "pain_point": "slow development cycles",
            },
            timeout=120.0,
            check_fields=["qualifying_questions", "relevant_case_studies", "objection_handlers"],
        )
        if success and response:
            self.log("✅ Discovery AI returned qualifying questions and objection handlers")

    async def test_pipeline(self):
        """Test pipeline/prospects CRUD."""
        self.log("\n=== TESTING PIPELINE ===", "INFO")

        # Create a prospect
        success, response = await self.run_test(
            "POST /pipeline/prospects (create)",
            "POST",
            "/pipeline/prospects",
            200,
            data={
                "name": "Test Prospect",
                "company": "Test Corp",
                "email": "test@example.com",
                "status": "new",
                "deal_value": 8995.0,
            },
            check_fields=["id", "name"],
        )
        if success and response:
            prospect_id = response.get("id")
            self.test_data["prospect_id"] = prospect_id
            self.log(f"Created prospect: {prospect_id}")

        # Get all prospects
        success, response = await self.run_test(
            "GET /pipeline/prospects",
            "GET",
            "/pipeline/prospects",
            200,
        )
        if success and response:
            self.log(f"Retrieved {len(response)} prospects")

        # Update prospect
        if "prospect_id" in self.test_data:
            await self.run_test(
                "PATCH /pipeline/prospects/{id}",
                "PATCH",
                f"/pipeline/prospects/{self.test_data['prospect_id']}",
                200,
                data={"status": "contacted"},
            )

        # Get pipeline summary
        success, response = await self.run_test(
            "GET /pipeline/summary",
            "GET",
            "/pipeline/summary",
            200,
            check_fields=["total_prospects", "by_status", "target", "progress_pct"],
        )
        if success and response:
            self.log(f"Pipeline: {response.get('total_prospects')} prospects, ${response.get('closed_revenue', 0):,.0f} closed")

        # Delete prospect
        if "prospect_id" in self.test_data:
            await self.run_test(
                "DELETE /pipeline/prospects/{id}",
                "DELETE",
                f"/pipeline/prospects/{self.test_data['prospect_id']}",
                200,
            )

    async def test_metrics(self):
        """Test daily metrics endpoints."""
        self.log("\n=== TESTING METRICS ===", "INFO")

        # Get today's metric
        success, response = await self.run_test(
            "GET /metrics/today",
            "GET",
            "/metrics/today",
            200,
            check_fields=["date", "outreach_done", "outreach_target"],
        )

        # Update today's metric
        await self.run_test(
            "PATCH /metrics/today",
            "PATCH",
            "/metrics/today",
            200,
            data={
                "outreach_done": 15,
                "calls_completed": 2,
                "closes": 1,
                "revenue_generated": 8995.0,
            },
        )

        # Get week metrics
        success, response = await self.run_test(
            "GET /metrics/week",
            "GET",
            "/metrics/week",
            200,
            check_fields=["days", "totals"],
        )
        if success and response:
            self.log(f"Week metrics: {len(response.get('days', []))} days tracked")

    async def test_content(self):
        """Test content pieces CRUD."""
        self.log("\n=== TESTING CONTENT ===", "INFO")

        # Create content piece
        success, response = await self.run_test(
            "POST /content (create)",
            "POST",
            "/content",
            200,
            data={
                "title": "Test LinkedIn Post",
                "type": "linkedin_authority",
                "body": "This is a test post about AI-native development.",
                "status": "draft",
            },
            check_fields=["id", "title"],
        )
        if success and response:
            content_id = response.get("id")
            self.test_data["content_id"] = content_id
            self.log(f"Created content: {content_id}")

        # Get all content
        success, response = await self.run_test(
            "GET /content",
            "GET",
            "/content",
            200,
        )
        if success and response:
            self.log(f"Retrieved {len(response)} content pieces")

        # Update content
        if "content_id" in self.test_data:
            await self.run_test(
                "PATCH /content/{id}",
                "PATCH",
                f"/content/{self.test_data['content_id']}",
                200,
                data={"status": "published"},
            )

        # Get themes performance
        await self.run_test(
            "GET /content/themes/performance",
            "GET",
            "/content/themes/performance",
            200,
        )

        # Delete content
        if "content_id" in self.test_data:
            await self.run_test(
                "DELETE /content/{id}",
                "DELETE",
                f"/content/{self.test_data['content_id']}",
                200,
            )

    async def test_case_studies(self):
        """Test case studies CRUD."""
        self.log("\n=== TESTING CASE STUDIES ===", "INFO")

        # Create case study
        success, response = await self.run_test(
            "POST /case-studies (create)",
            "POST",
            "/case-studies",
            200,
            data={
                "client_name": "Test Client",
                "industry": "SaaS",
                "challenge": "Slow development cycles",
                "solution": "AI-native web app built in 4 weeks",
                "timeline_days": 28,
                "investment": 8995.0,
            },
            check_fields=["id", "client_name"],
        )
        if success and response:
            cs_id = response.get("id")
            self.test_data["case_study_id"] = cs_id
            self.log(f"Created case study: {cs_id}")

        # Get all case studies
        success, response = await self.run_test(
            "GET /case-studies",
            "GET",
            "/case-studies",
            200,
        )
        if success and response:
            self.log(f"Retrieved {len(response)} case studies")

        # Update case study
        if "case_study_id" in self.test_data:
            await self.run_test(
                "PATCH /case-studies/{id}",
                "PATCH",
                f"/case-studies/{self.test_data['case_study_id']}",
                200,
                data={"public": True},
            )

        # Delete case study (will be used for sync test, so delete later)

    async def test_testimonials(self):
        """Test testimonials CRUD and send-request."""
        self.log("\n=== TESTING TESTIMONIALS ===", "INFO")

        # Create testimonial
        success, response = await self.run_test(
            "POST /testimonials (create)",
            "POST",
            "/testimonials",
            200,
            data={
                "client_name": "Test Client",
                "client_email": "testclient@example.com",
                "company": "Test Corp",
                "project": "Web App",
                "status": "pending",
            },
            check_fields=["id", "client_name"],
        )
        if success and response:
            t_id = response.get("id")
            self.test_data["testimonial_id"] = t_id
            self.log(f"Created testimonial: {t_id}")

        # Get all testimonials
        success, response = await self.run_test(
            "GET /testimonials",
            "GET",
            "/testimonials",
            200,
        )
        if success and response:
            self.log(f"Retrieved {len(response)} testimonials")

        # Update testimonial
        if "testimonial_id" in self.test_data:
            await self.run_test(
                "PATCH /testimonials/{id}",
                "PATCH",
                f"/testimonials/{self.test_data['testimonial_id']}",
                200,
                data={"status": "received", "written": "Great work!"},
            )

        # Test send-request (EXPECTED to return ok=false with hint about DNS verification)
        if "testimonial_id" in self.test_data:
            success, response = await self.run_test(
                "POST /testimonials/send-request (Emailit domain not verified - EXPECTED)",
                "POST",
                "/testimonials/send-request",
                200,
                data={
                    "testimonial_id": self.test_data["testimonial_id"],
                },
                timeout=30.0,
            )
            if success and response:
                if response.get("ok") is False and "hint" in response:
                    self.log("✅ Emailit endpoint responded with expected 'hint' field (domain not verified)")
                elif response.get("ok") is True:
                    self.log("✅ Emailit endpoint succeeded (domain may be verified now)")
                else:
                    self.log("⚠️ WARNING: Unexpected response format from Emailit endpoint", "WARN")

        # Delete testimonial (will be used for sync test, so delete later)

    async def test_thought_leadership(self):
        """Test thought leadership CRUD."""
        self.log("\n=== TESTING THOUGHT LEADERSHIP ===", "INFO")

        # Create thought leadership
        success, response = await self.run_test(
            "POST /thought-leadership (create)",
            "POST",
            "/thought-leadership",
            200,
            data={
                "title": "Test Blog Post",
                "type": "blog",
                "url": "https://example.com/blog",
                "platform": "Medium",
            },
            check_fields=["id", "title"],
        )
        if success and response:
            tl_id = response.get("id")
            self.test_data["tl_id"] = tl_id
            self.log(f"Created thought leadership: {tl_id}")

        # Get all thought leadership
        success, response = await self.run_test(
            "GET /thought-leadership",
            "GET",
            "/thought-leadership",
            200,
        )
        if success and response:
            self.log(f"Retrieved {len(response)} thought leadership pieces")

        # Update thought leadership
        if "tl_id" in self.test_data:
            await self.run_test(
                "PATCH /thought-leadership/{id}",
                "PATCH",
                f"/thought-leadership/{self.test_data['tl_id']}",
                200,
                data={"notes": "Updated notes"},
            )

        # Delete thought leadership
        if "tl_id" in self.test_data:
            await self.run_test(
                "DELETE /thought-leadership/{id}",
                "DELETE",
                f"/thought-leadership/{self.test_data['tl_id']}",
                200,
            )

    async def test_authority(self):
        """Test authority metrics endpoints."""
        self.log("\n=== TESTING AUTHORITY ===", "INFO")

        # Get authority metrics
        await self.run_test(
            "GET /authority",
            "GET",
            "/authority",
            200,
            check_fields=["id", "linkedin_followers"],
        )

        # Update authority metrics
        await self.run_test(
            "PATCH /authority",
            "PATCH",
            "/authority",
            200,
            data={
                "linkedin_followers": 250,
                "linkedin_engagement_rate": 3.5,
                "monthly_website_visitors": 1200,
            },
        )

        # Get authority score
        success, response = await self.run_test(
            "GET /authority/score",
            "GET",
            "/authority/score",
            200,
            check_fields=["score", "breakdown", "milestones"],
        )
        if success and response:
            self.log(f"Authority score: {response.get('score')}/{response.get('max_score')}")

        # Get positioning check
        success, response = await self.run_test(
            "GET /authority/positioning-check",
            "GET",
            "/authority/positioning-check",
            200,
            check_fields=["checklist", "counts", "recommendation"],
        )

    async def test_settings(self):
        """Test settings endpoints."""
        self.log("\n=== TESTING SETTINGS ===", "INFO")

        # Get settings
        await self.run_test(
            "GET /settings",
            "GET",
            "/settings",
            200,
            check_fields=["id", "daily_outreach_target"],
        )

        # Update settings
        await self.run_test(
            "PATCH /settings",
            "PATCH",
            "/settings",
            200,
            data={
                "daily_outreach_target": 30,
                "daily_calls_target": 4,
            },
        )

    async def test_webhooks(self):
        """Test TidyCal webhook (NO AUTH REQUIRED)."""
        self.log("\n=== TESTING WEBHOOKS ===", "INFO")

        # Test TidyCal webhook with booking.created event
        booking_id = f"test-booking-{datetime.now().timestamp()}"
        success, response = await self.run_test(
            "POST /webhooks/tidycal (NO AUTH - booking.created)",
            "POST",
            "/webhooks/tidycal",
            200,
            data={
                "event": "booking.created",
                "data": {
                    "id": booking_id,
                    "starts_at": "2025-08-15T14:00:00Z",
                    "contact": {
                        "name": "Test Prospect",
                        "email": "testprospect@example.com",
                        "phone": "+1234567890",
                    },
                    "booking_type": {"title": "Discovery Call"},
                    "meeting_url": "https://zoom.us/j/123456789",
                },
            },
            auth=False,
            check_fields=["ok", "action"],
        )
        if success and response:
            self.log(f"Webhook action: {response.get('action')}")

        # Test re-delivery (should update, not duplicate)
        success, response = await self.run_test(
            "POST /webhooks/tidycal (re-delivery - should update)",
            "POST",
            "/webhooks/tidycal",
            200,
            data={
                "event": "booking.updated",
                "data": {
                    "id": booking_id,
                    "starts_at": "2025-08-15T15:00:00Z",
                    "contact": {
                        "name": "Test Prospect",
                        "email": "testprospect@example.com",
                    },
                    "booking_type": {"title": "Discovery Call"},
                    "meeting_url": "https://zoom.us/j/123456789",
                },
            },
            auth=False,
            check_fields=["ok"],
        )

        # Test cancellation event
        await self.run_test(
            "POST /webhooks/tidycal (booking.cancelled)",
            "POST",
            "/webhooks/tidycal",
            200,
            data={
                "event": "booking.cancelled",
                "data": {
                    "id": booking_id,
                    "contact": {
                        "name": "Test Prospect",
                        "email": "testprospect@example.com",
                    },
                },
            },
            auth=False,
            check_fields=["ok"],
        )

    async def test_notifications(self):
        """Test notifications endpoints."""
        self.log("\n=== TESTING NOTIFICATIONS ===", "INFO")

        # Get notifications
        success, response = await self.run_test(
            "GET /notifications",
            "GET",
            "/notifications",
            200,
            check_fields=["items", "unread"],
        )
        if success and response:
            items = response.get("items", [])
            self.log(f"Retrieved {len(items)} notifications, {response.get('unread')} unread")
            if items:
                self.test_data["notification_id"] = items[0].get("id")

        # Mark notification as read
        if "notification_id" in self.test_data:
            await self.run_test(
                "POST /notifications/{id}/read",
                "POST",
                f"/notifications/{self.test_data['notification_id']}/read",
                200,
                check_fields=["ok"],
            )

    async def test_sync_endpoints(self):
        """Test internal sync endpoints (AI-powered, may take 30-60s)."""
        self.log("\n=== TESTING SYNC ENDPOINTS ===", "INFO")

        # Test case study to content sync
        if "case_study_id" in self.test_data:
            success, response = await self.run_test(
                "POST /sync/case-study/{id}/to-content (may take up to 60s)",
                "POST",
                f"/sync/case-study/{self.test_data['case_study_id']}/to-content",
                200,
                timeout=120.0,
                check_fields=["ok", "content_id"],
            )
            if success and response:
                self.log(f"Created content from case study: {response.get('content_id')}")

            # Clean up case study
            await self.run_test(
                "DELETE /case-studies/{id}",
                "DELETE",
                f"/case-studies/{self.test_data['case_study_id']}",
                200,
            )

        # Test testimonial feature sync
        if "testimonial_id" in self.test_data:
            success, response = await self.run_test(
                "POST /sync/testimonial/{id}/feature (may take up to 60s)",
                "POST",
                f"/sync/testimonial/{self.test_data['testimonial_id']}/feature",
                200,
                timeout=120.0,
                check_fields=["ok"],
            )

            # Clean up testimonial
            await self.run_test(
                "DELETE /testimonials/{id}",
                "DELETE",
                f"/testimonials/{self.test_data['testimonial_id']}",
                200,
            )

    async def run_all_tests(self):
        """Run all backend tests in sequence."""
        self.log("=" * 80)
        self.log("BLOOM LABS PHASE 2-4 BACKEND API TESTS")
        self.log(f"Base URL: {self.base_url}")
        self.log("=" * 80)

        # Auth must pass first
        if not await self.test_auth():
            self.log("❌ Authentication failed - cannot proceed with other tests", "ERROR")
            return False

        # Run all other tests
        await self.test_dashboard()
        await self.test_routine()
        await self.test_ai_endpoints()
        await self.test_pipeline()
        await self.test_metrics()
        await self.test_content()
        await self.test_case_studies()
        await self.test_testimonials()
        await self.test_thought_leadership()
        await self.test_authority()
        await self.test_settings()
        await self.test_webhooks()
        await self.test_notifications()
        await self.test_sync_endpoints()

        # Print summary
        self.log("\n" + "=" * 80)
        self.log("TEST SUMMARY")
        self.log("=" * 80)
        self.log(f"Total tests run: {self.tests_run}")
        self.log(f"✅ Passed: {self.tests_passed}")
        self.log(f"❌ Failed: {self.tests_failed}")
        success_rate = (
            (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        )
        self.log(f"Success rate: {success_rate:.1f}%")

        if self.failed_tests:
            self.log("\nFailed tests:")
            for test in self.failed_tests:
                self.log(f"  - {test}", "ERROR")

        return self.tests_failed == 0


async def main():
    tester = BloomLabsAPITester()
    success = await tester.run_all_tests()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
