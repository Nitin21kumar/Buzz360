from app.auth.permissions import (
    MODULE_CATALOG,
    default_permissions_for_role,
)


def test_super_admin_gets_every_module_service_and_field():
    perms = default_permissions_for_role("super_admin")
    assert set(perms["modules"]) == set(MODULE_CATALOG.keys())
    for module, cfg in MODULE_CATALOG.items():
        for service in cfg["services"]:
            assert f"{module}:{service}" in perms["services"]
        for field in cfg["fields"]:
            assert f"{module}:{field}" in perms["fields"]


def test_admin_gets_the_same_full_access_as_super_admin():
    assert default_permissions_for_role("admin") == default_permissions_for_role("super_admin")


def test_plain_user_sees_every_module_except_users_but_starts_with_no_services():
    perms = default_permissions_for_role("user")
    assert "users" not in perms["modules"]
    assert set(perms["modules"]) == set(MODULE_CATALOG.keys()) - {"users"}
    assert perms["services"] == []
    assert perms["fields"] == []
