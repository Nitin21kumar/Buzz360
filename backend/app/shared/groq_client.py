
import httpx

from app.core.config import settings
from app.core.exceptions import UpstreamServiceError

GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def _split_text(text: str, limit: int = 6000) -> list[str]:
    chunks: list[str] = []
    remaining = text.strip()
    markers = ["\n\n", "\n", "। ", ". ", "? ", "! "]
    while len(remaining) > limit:
        window = remaining[: limit + 1]
        boundary = max((window.rfind(m) for m in markers), default=-1)
        end = boundary + 1 if boundary > limit * 0.5 else limit
        chunks.append(remaining[:end].strip())
        remaining = remaining[end:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


async def _call_groq(prompt: str, system_instruction: str) -> str:
    if not settings.groq_api_key:
        raise UpstreamServiceError("GROQ_API_KEY is not configured on the backend")

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
            json=payload,
        )

    if response.is_error:
        try:
            detail = response.json().get("error", {}).get("message") or response.text
        except ValueError:
            detail = response.text
        raise UpstreamServiceError(detail or "Groq request failed")

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        raise UpstreamServiceError("Groq returned no usable text")


async def translate_text(text: str, source_lang_name: str, target_lang_name: str, gender: str, strict_native_script: bool = False, source_is_hinglish: bool = False) -> str:
    speaker_gender = "male" if gender == "male" else "female"
    system_instruction = (
        "You are a professional translator for outbound voice-call (OBD) campaign scripts. "
        "Translate the user's text faithfully, preserving its meaning, tone and intent - it will "
        "be read aloud by a text-to-speech voice, so keep it natural, spoken-style language, not "
        "stiff written language. "
        f"The script will be voiced by a {speaker_gender} speaker: wherever the target language's "
        f"grammar distinguishes speaker gender (pronouns, verb conjugations, adjective agreement), "
        f"phrase the translation as a {speaker_gender} speaker would say it. "
        "Break long sentences into shorter, natural spoken sentences (this is a voice script, not a "
        "written document) and punctuate for natural pauses: use commas for short pauses, and end "
        "each sentence with the correct sentence-ending mark for that script (e.g. '।' for Hindi/"
        "Devanagari-based languages, '.' for English) - Sarvam's TTS engine uses this punctuation to "
        "time its pauses and prosody, so under-punctuating makes the audio sound flat and robotic. "
        "Keep any placeholders, numbers, names, dates, and amounts exactly as given. "
        "Output ONLY the translated text in the target language's native script - no explanations, "
        "no quotes, no markdown, no transliteration, no notes."
    )
    if source_is_hinglish:
        system_instruction += (
            " NOTE ON THE SOURCE TEXT: it is Hinglish - Hindi and English words mixed together and "
            "typed in Roman/Latin letters (not Devanagari), e.g. 'kal aapka order deliver ho jayega'. "
            "This is NOT already-correct text that just needs its script converted - do NOT do a "
            "letter-by-letter or word-by-word transliteration of the Roman spelling into the target "
            "script. Instead, read the whole sentence for its actual meaning (the Hindi part AND the "
            "English part together) and produce a proper, natural, fully-translated sentence in the "
            "target language - including translating every English word in the source (like 'order', "
            "'deliver', 'update', 'confirm') into its correct target-language equivalent, not simply "
            "re-spelling it in the target script."
        )
    if strict_native_script:
        system_instruction += (
            f" STRICT RULE: the output must be ENTIRELY in {target_lang_name} - do not leave ANY word "
            f"from {source_lang_name} (or any other language) untranslated, and do not code-switch "
            f"(no Hinglish-style mixing, no stray Latin-script words dropped into a native-script "
            f"output, and no stray non-English words left in an English output either). Every common "
            f"word or phrase (e.g. 'offer', 'discount', 'order', 'delivery', 'update') must be "
            f"rendered in its proper {target_lang_name} equivalent. If {target_lang_name} has its own "
            f"native script, write the ENTIRE output in that script - never in Latin/Roman letters, "
            "and never as a transliteration. The ONLY exceptions are things with no real translation - "
            "brand names, product names, and proper nouns - and even those must be spelled out "
            f"phonetically the way {target_lang_name} naturally represents them, not left in the "
            "source language's script or spelling."
        )

    translated_parts = []
    for chunk in _split_text(text):
        prompt = f"Source language: {source_lang_name}\nTarget language: {target_lang_name}\n\nText to translate:\n{chunk}"
        translated_parts.append(await _call_groq(prompt, system_instruction))
    return "\n".join(translated_parts).strip()


async def correct_transcript(transcript: str, language_name: str) -> str:
    if not transcript.strip():
        return transcript

    system_instruction = (
        "You are proofreading a raw speech-to-text transcript for an outbound calling (OBD) system. "
        f"The transcript is in {language_name}. Fix likely mishearing/spelling errors and add natural "
        "punctuation and sentence casing where missing. Do NOT translate it into another language. "
        "Do NOT add, remove, or rephrase content beyond fixing clear transcription errors - preserve "
        "the speaker's original wording, meaning and language as closely as possible. "
        "Output ONLY the corrected transcript text - no explanations, no quotes, no markdown."
    )
    prompt = f"Raw transcript:\n{transcript.strip()}"
    return await _call_groq(prompt, system_instruction)

