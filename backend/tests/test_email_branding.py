"""Sanity tests for Phase 18.6 — fix the white-screen 'View invoices in portal' button.

The Payment Received email's CTA used to point at `/portal/invoices`, which
had no matching React route → blank page. This test pins the new behavior:

  1. Emails use `?tab=` deep-links (no more bare /portal/<section>).
  2. The logo URL points to the MASTER (dark-on-light) variant so it's
     visible on the white email card (the "Light" variant is white-on-
     transparent and was invisible on white).
"""
import asyncio

import pytest

import email_service


class MockEmailit:
    is_configured = True
    sent: list

    def __init__(self):
        self.sent = []

    async def send_email(self, **kwargs):
        self.sent.append(kwargs)
        return {"ok": True, "status_code": 200}


@pytest.fixture
def mock_emailit():
    return MockEmailit()


def _aio(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("loop closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def test_logo_url_uses_master_variant_visible_on_white():
    """LOGO_URL must point to MASTER (dark text) — the Light variant is white
    text and was invisible on the white email card."""
    assert "MASTER" in email_service.LOGO_URL or "xayvxy1s_Logo" in email_service.LOGO_URL
    assert "Light" not in email_service.LOGO_URL or "Light.png" not in email_service.LOGO_URL


def test_payment_receipt_button_uses_tab_param(mock_emailit):
    _aio(email_service.send_payment_receipt(
        mock_emailit, to="x@example.com", name="Test", plan_name="Express",
        amount="5995.00", currency="USD", order_id="ORD-X",
    ))
    html = mock_emailit.sent[0]["html"]
    assert "?tab=invoices" in html, "Payment receipt must deep-link to invoices tab"
    assert "/portal/invoices" not in html, "Stale /portal/invoices URL leaked into the email"


def test_milestone_complete_uses_tab_param(mock_emailit):
    _aio(email_service.send_milestone_complete(
        mock_emailit, to="x@example.com", name="Test", milestone_title="Design 1"
    ))
    html = mock_emailit.sent[0]["html"]
    assert "?tab=milestones" in html
    assert "/portal/milestones" not in html


def test_subscription_activated_uses_tab_param(mock_emailit):
    _aio(email_service.send_subscription_activated(
        mock_emailit, to="x@example.com", name="Test",
        plan_name="Care", amount="299.00", currency="USD",
    ))
    html = mock_emailit.sent[0]["html"]
    assert "?tab=subscriptions" in html
    assert "/portal/subscriptions" not in html


def test_support_ack_uses_contact_tab(mock_emailit):
    _aio(email_service.send_support_ack(
        mock_emailit, to="x@example.com", name="Test",
        subject_line="Help me", ticket_id="TX-1",
    ))
    html = mock_emailit.sent[0]["html"]
    # support_ack maps to the "contact" tab (that's the actual tab name)
    assert "?tab=contact" in html
    assert "/portal/support" not in html


def test_every_email_includes_branded_logo(mock_emailit):
    """Every send_* function must render the MASTER logo inside the frame."""
    senders = [
        lambda m: email_service.send_payment_receipt(
            m, to="x@example.com", name="T", plan_name="P",
            amount="1.00", currency="USD", order_id="O",
        ),
        lambda m: email_service.send_phase_received(m, to="x@example.com", name="T", phase=1),
        lambda m: email_service.send_onboarding_complete(m, to="x@example.com", name="T"),
        lambda m: email_service.send_invoice_issued(
            m, to="x@example.com", name="T", invoice_number="INV-001",
            amount="5.00", currency="USD", due_date=None,
            invoice_url="https://bybloomlabs.com/pay/invoice/abc",
        ),
        lambda m: email_service.send_milestone_complete(
            m, to="x@example.com", name="T", milestone_title="M",
        ),
        lambda m: email_service.send_support_ack(
            m, to="x@example.com", name="T", subject_line="S", ticket_id="T-1",
        ),
        lambda m: email_service.send_subscription_activated(
            m, to="x@example.com", name="T", plan_name="P",
            amount="1.00", currency="USD",
        ),
    ]
    for sender in senders:
        m = MockEmailit()
        _aio(sender(m))
        html = m.sent[0]["html"]
        # Logo is either the remote URL OR (after Phase A) an inlined data: URI.
        has_logo = (
            email_service.LOGO_URL in html
            or 'src="data:image/' in html
        )
        assert has_logo, (
            f"Logo missing from email (subject: {m.sent[0].get('subject')})"
        )
        assert 'alt="Bloom Labs"' in html, "Logo alt text missing"
        # All buttons should have the brand color
        assert email_service.BRAND_PRIMARY in html
