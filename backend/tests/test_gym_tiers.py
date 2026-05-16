"""Verify gym-niche PayPal tiers + support-tier mapping."""
import os
import sys

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

import pytest


def test_gym_tiers_present_with_correct_prices():
    from paypal_routes import PACKAGE_TIERS

    assert "gym_prototype" in PACKAGE_TIERS
    assert "gym_express" in PACKAGE_TIERS
    assert "gym_custom" in PACKAGE_TIERS
    assert "gym_enterprise" in PACKAGE_TIERS
    assert PACKAGE_TIERS["gym_prototype"]["price"] == "2995.00"
    assert PACKAGE_TIERS["gym_express"]["price"] == "5995.00"
    assert PACKAGE_TIERS["gym_custom"]["price"] == "8995.00"
    assert PACKAGE_TIERS["gym_enterprise"]["price"] == "14995.00"
    # All gym tiers must carry the niche flag for analytics
    for k in ("gym_prototype", "gym_express", "gym_custom", "gym_enterprise"):
        assert PACKAGE_TIERS[k].get("niche") == "gym_owners"
        assert isinstance(PACKAGE_TIERS[k].get("inclusions"), list)
        assert len(PACKAGE_TIERS[k]["inclusions"]) >= 3


def test_gym_prototype_skips_full_upfront_discount():
    """Prototype is too cheap to warrant a $500 upfront discount."""
    from paypal_routes import compute_charge

    c = compute_charge("gym_prototype", "full_upfront")
    assert c["base_amount"] == "2995.00"
    assert c["charge_now"] == "2995.00"  # no discount applied
    assert c["discount_applied"] == "0.00"
    assert "discount" not in c["plan_label"].lower()


def test_gym_tiers_map_to_support_tiers():
    from support_subscription_routes import PACKAGE_TO_SUPPORT_TIER

    assert PACKAGE_TO_SUPPORT_TIER["gym_prototype"] == "standard"
    assert PACKAGE_TO_SUPPORT_TIER["gym_express"] == "standard"
    assert PACKAGE_TO_SUPPORT_TIER["gym_custom"] == "premium"
    assert PACKAGE_TO_SUPPORT_TIER["gym_enterprise"] == "vip"


def test_compute_charge_works_for_gym_tiers():
    from paypal_routes import compute_charge

    # Split 50/50 — same math as generic custom build
    c = compute_charge("gym_custom", "split_50_50")
    assert c["base_amount"] == "8995.00"
    assert c["charge_now"] == "4497.50"
    assert c["charge_later"] == "4497.50"

    # Full upfront — same $500 discount applies
    c2 = compute_charge("gym_enterprise", "full_upfront")
    assert c2["base_amount"] == "14995.00"
    assert c2["charge_now"] == "14495.00"
    assert c2["discount_applied"] == "500.00"
