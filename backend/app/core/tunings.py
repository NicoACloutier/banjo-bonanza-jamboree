"""
Canonical banjo tuning definitions.

Each tuning defines the open-string pitch (scientific pitch notation, e.g.
"D4") for all 5 strings of a 5-string banjo. String 1 is the thinnest/highest
pitched "first" string; string 5 is the short drone/thumb string.

Frequencies are derived at runtime from these note names (see
`app.services.audio_theory`), so transposition (playing a tuning "up" or
"down" N frets/semitones) is just semitone arithmetic -- no need to hardcode
a frequency table per tuning.
"""

from __future__ import annotations

import msgspec


class TuningDefinition(msgspec.Struct, frozen=True):
    key: str
    display_name: str
    # Index 0 = string 1 ... index 4 = string 5 (the short drone string).
    open_strings: tuple[str, str, str, str, str]
    description: str = ""


TUNINGS: dict[str, TuningDefinition] = {
    t.key: t
    for t in [
        TuningDefinition(
            key="standard_g",
            display_name="Standard G (Open G)",
            open_strings=("D4", "B3", "G3", "D3", "G4"),
            description="The most common 5-string banjo tuning: gDGBD.",
        ),
        TuningDefinition(
            key="double_c",
            display_name="Double C",
            open_strings=("D4", "C4", "G3", "C3", "G4"),
            description="gCGCD -- popular for old-time clawhammer melodies.",
        ),
        TuningDefinition(
            key="sawmill",
            display_name="Sawmill (G Modal)",
            open_strings=("D4", "C4", "G3", "D3", "G4"),
            description="gDGCD -- a modal tuning used for tunes like 'Sail Away Ladies'.",
        ),
        TuningDefinition(
            key="open_d",
            display_name="Open D",
            open_strings=("D4", "A3", "F#3", "D3", "F#4"),
            description="f#DF#AD -- used for tunes in the key of D.",
        ),
        TuningDefinition(
            key="double_d",
            display_name="Double D",
            open_strings=("D4", "A3", "D3", "D3", "A4"),
            description="aDADE-family double D tuning.",
        ),
        TuningDefinition(
            key="drop_c",
            display_name="Drop C",
            open_strings=("D4", "B3", "G3", "C3", "G4"),
            description="gCGBD -- Open G with the 4th string dropped to C.",
        ),
    ]
}


def get_tuning(key: str) -> TuningDefinition:
    try:
        return TUNINGS[key]
    except KeyError as exc:
        raise ValueError(f"Unknown tuning key: {key!r}") from exc
