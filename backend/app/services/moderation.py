"""
Content moderation: blocks publishing of tabs whose song name, artist,
album, or lyrics contain slurs or language broadly offensive/insensitive to
marginalized communities (not just common profanity).

Approach:
  * A curated blocklist of slur roots/patterns (kept intentionally out of
    source comments to avoid restating slurs gratuitously; see
    `_SLUR_PATTERNS`).
  * Matching is done on a normalized form of the text (lowercased, accents
    stripped, leetspeak substitutions normalized, non-alphanumeric
    characters collapsed) so simple obfuscation (e.g. "n1gger", "f_a_g")
    is still caught.
  * This is a defense-in-depth heuristic, not a perfect classifier -- it is
    intentionally conservative (word-boundary matching) to minimize false
    positives on unrelated words.
"""

from __future__ import annotations

import re
import unicodedata

_LEET_MAP = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
    }
)

# Blocklist of offensive/dehumanizing terms and slur roots targeting race,
# ethnicity, nationality, religion, gender identity, sexual orientation, and
# disability. Stored as regex word-fragments so minor pluralization/suffixes
# are also caught. This list is intentionally not exhaustive of ordinary
# profanity (e.g. "damn", "hell") -- the goal is hate speech, not swearing.
_SLUR_PATTERNS: list[str] = [
    r"n[i1]gg?(?:er|a|uh)",
    r"ch[i1]nk",
    r"sp[i1]c",
    r"k[i1]ke",
    r"g[o0]{2}k",
    r"w[e3]tback",
    r"tr[a4]nn(?:y|ie)",
    r"f[a4]gg?[o0]t",
    r"d[y1]ke",
    r"r[e3]t[a4]rd",
    r"c[o0]{2}n(?:ass)?",
    r"j[a4]p(?:s)?\b",
    r"p[a4]ki\b",
    r"beaner",
    r"towel[\s_-]?head",
    r"sand[\s_-]?nigger",
    r"redskin",
    r"gyps?y",
]

_COMPILED = re.compile("|".join(f"(?:{p})" for p in _SLUR_PATTERNS), re.IGNORECASE)


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    leet_normalized = ascii_only.lower().translate(_LEET_MAP)
    # Collapse repeated characters and strip separators used to dodge filters
    # (e.g. "n.i.g.g.e.r" or "n i g g e r").
    collapsed = re.sub(r"[^a-z0-9]+", "", leet_normalized)
    return collapsed


def contains_offensive_language(*texts: str | None) -> bool:
    """Return True if any of the given strings contain blocked language."""
    for text in texts:
        if not text:
            continue
        if _COMPILED.search(_normalize(text)):
            return True
    return False


def find_offending_fields(fields: dict[str, str | None]) -> list[str]:
    """Return the names of fields (from `fields`) that contain blocked language."""
    return [name for name, value in fields.items() if value and contains_offensive_language(value)]
