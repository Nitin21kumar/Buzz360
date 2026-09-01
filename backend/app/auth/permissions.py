MODULE_CATALOG = {
    "dashboard": {
        "label": "Dashboard",
        "services": {
            "view": "View dashboard & analytics",
        },
        "fields": [],
    },
    "tts": {
        "label": "Text to Speech",
        "services": {
            "view": "View voice folders",
            "generate": "Generate new audio",
            "delete": "Delete generated audio",
        },
        "fields": ["text", "speaker", "pace", "temperature"],
    },
    "stt": {
        "label": "Speech to Text",
        "services": {
            "view": "View transcription history",
            "transcribe": "Transcribe audio",
        },
        "fields": [],
    },
    "voices": {
        "label": "Manage Voices",
        "services": {
            "view": "View voice folders",
            "create": "Create voice folders",
            "delete": "Delete voice folders",
        },
        "fields": [],
    },
    "campaigns": {
        "label": "Campaigns",
        "services": {
            "view": "View campaigns",
            "create": "Create campaigns",
            "edit": "Edit campaigns",
            "delete": "Delete campaigns",
            "trigger": "Start / stop calling",
        },
        "fields": ["budget", "script", "contact_list", "schedule"],
    },
    "whatsapp": {
        "label": "WhatsApp",
        "services": {
            "view": "View campaigns & reports",
            "create": "Create campaigns",
            "edit": "Upload / clear contacts",
            "delete": "Delete campaigns",
            "trigger": "Start broadcast",
            "templates_manage": "Add / remove saved template IDs (wid)",
        },
        "fields": [],
    },
    "sms": {
        "label": "SMS",
        "services": {
            "view": "View SMS campaigns",
            "create": "Create SMS campaigns",
            "edit": "Add campaign contacts",
            "delete": "Delete draft SMS campaigns",
            "send": "Send individual SMS messages",
            "trigger": "Start SMS campaigns",
        },
        "fields": [],
    },
    "rcs": {
        "label": "RCS",
        "services": {
            "view": "View campaigns & reports",
            "create": "Create campaigns",
            "edit": "Upload / clear contacts",
            "delete": "Delete campaigns",
            "trigger": "Start broadcast",
            "templates_manage": "Add / remove saved template IDs",
        },
        "fields": [],
    },
    "users": {
        "label": "User Management",
        "services": {
            "view": "View users",
            "create": "Create users",
            "edit": "Edit users & permissions",
            "delete": "Deactivate / delete users",
        },
        "fields": [],
    },
}

ROLES = ["super_admin", "admin", "user"]

ASSIGNABLE_ROLES = {
    "super_admin": ["super_admin", "admin", "user"],
    "admin": ["user"],
    "user": [],
}


def default_permissions_for_role(role: str) -> dict:
    if role in ("super_admin", "admin"):
        return {"modules": list(MODULE_CATALOG.keys()), "services": _all_services(), "fields": _all_fields()}
    return {
        "modules": [m for m in MODULE_CATALOG if m != "users"],
        "services": [],
        "fields": [],
    }


def _all_services() -> list[str]:
    out = []
    for mod, cfg in MODULE_CATALOG.items():
        for svc in cfg["services"]:
            out.append(f"{mod}:{svc}")
    return out


def _all_fields() -> list[str]:
    out = []
    for mod, cfg in MODULE_CATALOG.items():
        for f in cfg["fields"]:
            out.append(f"{mod}:{f}")
    return out


def catalog_response() -> dict:
    return {
        "roles": ROLES,
        "assignable_roles": ASSIGNABLE_ROLES,
        "modules": [
            {
                "key": key,
                "label": cfg["label"],
                "services": [{"key": f"{key}:{s}", "label": label} for s, label in cfg["services"].items()],
                "fields": [{"key": f"{key}:{f}", "label": f} for f in cfg["fields"]],
            }
            for key, cfg in MODULE_CATALOG.items()
        ],
    }
