import re

from app.modules.tts.service import _split_text


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def test_short_text_is_a_single_chunk():
    text = "Hello, this is a short message."
    chunks = _split_text(text, limit=1800)
    assert chunks == [text]


def test_text_at_exactly_the_limit_is_a_single_chunk():
    text = "a" * 1800
    chunks = _split_text(text, limit=1800)
    assert chunks == [text]


def test_splits_on_sentence_boundary_when_one_exists_near_the_limit():
    first_sentence = "a" * 1700 + ". "
    second_sentence = "b" * 50
    text = first_sentence + second_sentence
    chunks = _split_text(text, limit=1800)
    assert len(chunks) == 2
    assert chunks[0] == first_sentence.strip()
    assert chunks[1] == second_sentence.strip()


def test_hard_splits_at_the_limit_when_no_natural_boundary_exists():
    text = "a" * 4000
    chunks = _split_text(text, limit=1800)
    assert len(chunks) == 3
    assert chunks[0] == "a" * 1800
    assert chunks[1] == "a" * 1800
    assert chunks[2] == "a" * 400
    assert "".join(chunks) == text


def test_no_data_is_lost_across_chunks():
    text = ("This is a sentence. " * 200).strip()
    chunks = _split_text(text, limit=1800)
    assert len(chunks) > 1
    reconstructed = " ".join(chunks)
    assert _normalize_whitespace(reconstructed) == _normalize_whitespace(text)


def test_empty_and_whitespace_text_produce_no_chunks():
    assert _split_text("", limit=1800) == []
    assert _split_text("   \n  ", limit=1800) == []
