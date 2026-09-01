import pytest

from app.modules.campaigns.sarv_gateway import map_sarv_status, normalize_mobile


@pytest.mark.parametrize(
    "phone_number,includes_country_code,expected",
    [
        ("+919876543210", "N", "9876543210"),
        ("919876543210", "N", "9876543210"),
        ("9876543210", "N", "9876543210"),
        ("+919876543210", "Y", "919876543210"),
        ("919876543210", "Y", "919876543210"),
        ("+12025550123", "N", "12025550123"),
    ],
)
def test_normalize_mobile(phone_number, includes_country_code, expected):
    assert normalize_mobile(phone_number, includes_country_code) == expected


@pytest.mark.parametrize(
    "status,expected",
    [
        ("Success", "initiated"),
        ("success", "initiated"),
        ("Answered", "completed"),
        ("completed", "completed"),
        ("Not Answered", "no-answer"),
        ("no answer", "no-answer"),
        ("noanswer", "no-answer"),
        ("Busy", "busy"),
        ("Failed", "failed"),
        ("Invalid", "failed"),
        ("some-unknown-status", "failed"),
        (None, "failed"),
        ("", "failed"),
    ],
)
def test_map_sarv_status(status, expected):
    assert map_sarv_status(status) == expected
