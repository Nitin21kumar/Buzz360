SARVAM_URL = "https://api.sarvam.ai"

LANGUAGE_DISPLAY = {
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "pa-IN": "Punjabi",
    "od-IN": "Odia",
    "en-IN": "English",
}

LANGUAGE_NAMES = {
    "hi-IN": "Hindi in Devanagari script",
    "bn-IN": "Bengali in Bengali script",
    "ta-IN": "Tamil in Tamil script",
    "te-IN": "Telugu in Telugu script",
    "gu-IN": "Gujarati in Gujarati script",
    "kn-IN": "Kannada in Kannada script",
    "ml-IN": "Malayalam in Malayalam script",
    "mr-IN": "Marathi in Devanagari script",
    "pa-IN": "Punjabi in Gurmukhi script",
    "od-IN": "Odia in Odia script",
    "en-IN": "Indian English",
    "hinglish": "Hinglish (Hindi-English code-mixed text, written in Roman/Latin script)",
}

LANGUAGES = set(LANGUAGE_DISPLAY.keys())

VOICE_MAP = {
    "hi-IN": {"male": "shubh", "female": "priya"},
    "te-IN": {"male": "shubh", "female": "priya"},
    "kn-IN": {"male": "shubh", "female": "priya"},
    "od-IN": {"male": "shubh", "female": "priya"},
    "ml-IN": {"male": "shubh", "female": "priya"},
    "ta-IN": {"male": "ratan", "female": "priya"},
    "mr-IN": {"male": "ratan", "female": "priya"},
    "gu-IN": {"male": "ratan", "female": "priya"},
    "en-IN": {"male": "ratan", "female": "priya"},
    "pa-IN": {"male": "mani", "female": "priya"},
    "bn-IN": {"male": "shubh", "female": "priya"},
}

DEFAULT_VOICE_MAP_ENTRY = {"male": "shubh", "female": "priya"}


def resolve_speaker(language_code: str, gender: str) -> str:
    entry = VOICE_MAP.get(language_code, DEFAULT_VOICE_MAP_ENTRY)
    return entry.get(gender, entry["female"])
