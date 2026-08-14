"""
Music-theory helper: converts scientific pitch notation (e.g. "D4", "F#3")
into frequencies (Hz), and applies semitone transposition. Shared by the
tunings API (so the frontend tuner/playback can render accurate pitches
without duplicating this math in JavaScript) -- the frontend also has an
equivalent implementation for the Web Audio playback engine.
"""

from __future__ import annotations

import re

_NOTE_OFFSETS = {
    "C": -9,
    "C#": -8,
    "DB": -8,
    "D": -7,
    "D#": -6,
    "EB": -6,
    "E": -5,
    "F": -4,
    "F#": -3,
    "GB": -3,
    "G": -2,
    "G#": -1,
    "AB": -1,
    "A": 0,
    "A#": 1,
    "BB": 1,
    "B": 2,
}

_NOTE_PATTERN = re.compile(r"^([A-Ga-g])([#b]?)(-?\d+)$")


def note_name_to_semitone_offset(note: str) -> int:
    """
    Convert a note name like "A4" to its semitone offset from A4 (i.e. A4 -> 0).
    """
    match = _NOTE_PATTERN.match(note.strip())
    if not match:
        raise ValueError(f"Invalid note name: {note!r}")
    letter, accidental, octave_str = match.groups()
    key = (letter + accidental).upper()
    if key not in _NOTE_OFFSETS:
        raise ValueError(f"Invalid note name: {note!r}")
    octave = int(octave_str)
    return _NOTE_OFFSETS[key] + (octave - 4) * 12


def note_name_to_frequency(note: str, transpose_semitones: int = 0) -> float:
    """Convert a note name (optionally transposed) to a frequency in Hz."""
    semitone_offset = note_name_to_semitone_offset(note) + transpose_semitones
    return 440.0 * (2.0 ** (semitone_offset / 12.0))


def fretted_frequency(open_string_note: str, fret: int, transpose_semitones: int = 0) -> float:
    """Frequency of a given fret on a string tuned to `open_string_note`."""
    return note_name_to_frequency(open_string_note, transpose_semitones=transpose_semitones + fret)
