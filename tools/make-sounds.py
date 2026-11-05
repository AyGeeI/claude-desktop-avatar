#!/usr/bin/env python3
"""Erzeugt die Hinweistöne der Mod (sounds/*.wav) per Synthese.

Kurze, leise Neon-Töne ohne fremde Samples; 22,05 kHz, 16 Bit, mono.

    python3 tools/make-sounds.py

Lizenz der Töne: CC BY 4.0 (wie die Vorlage Vela).
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sounds"


def env(t: float, length: float, attack: float = 0.006, release: float = 0.08) -> float:
    if t < 0 or t > length:
        return 0.0
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = min(1.0, (length - t) / release) if release > 0 else 1.0
    return a * r


def tone(freq: float, t: float, kind: str = "sine") -> float:
    phase = 2 * math.pi * freq * t
    if kind == "sine":
        return math.sin(phase)
    if kind == "glass":
        return 0.7 * math.sin(phase) + 0.2 * math.sin(2 * phase) + 0.1 * math.sin(3.01 * phase)
    if kind == "soft-square":
        return math.tanh(3 * math.sin(phase)) * 0.6
    if kind == "saw":
        return 2 * ((freq * t) % 1.0) - 1
    raise ValueError(kind)


def note(buf: list[float], start: float, length: float, freq: float, gain: float, kind: str = "glass", decay: float = 6.0, glide: float = 0.0) -> None:
    first = int(start * RATE)
    count = int((length + 0.05) * RATE)
    for i in range(count):
        t = i / RATE
        f = freq * (1 + glide * t / max(length, 1e-6))
        value = tone(f, t, kind) * env(t, length) * math.exp(-decay * t) * gain
        index = first + i
        if index < len(buf):
            buf[index] += value


def echo(buf: list[float], delay: float, feedback: float, mix: float) -> list[float]:
    d = int(delay * RATE)
    out = buf[:]
    for i in range(d, len(out)):
        out[i] += out[i - d] * feedback * mix
    return out


def write(name: str, buf: list[float], peak: float = 0.6) -> None:
    fade = int(0.03 * RATE)
    for i in range(fade):
        buf[len(buf) - fade + i] *= 1 - (i + 1) / fade
    top = max(1e-9, max(abs(v) for v in buf))
    scale = peak / top
    frames = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v * scale)) * 32767)) for v in buf)
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    print(f"{name}.wav  {len(buf) / RATE:.2f} s")


def blank(seconds: float) -> list[float]:
    return [0.0] * int(seconds * RATE)


# start: Hochlauf-Sweep, dann ein heller Doppelklang
buf = blank(0.9)
note(buf, 0.0, 0.38, 220, 0.35, "soft-square", decay=2.0, glide=3.2)
note(buf, 0.34, 0.5, 880, 0.5, "glass", decay=5.0)
note(buf, 0.42, 0.45, 1318.5, 0.35, "glass", decay=5.5)
write("start", echo(buf, 0.09, 0.35, 1.0))

# attention: zwei kurze Doppeltöne, aufsteigend
buf = blank(0.7)
for i, (a, b) in enumerate([(987.8, 1318.5), (1174.7, 1568.0)]):
    note(buf, i * 0.18, 0.14, a, 0.5, "glass", decay=9.0)
    note(buf, i * 0.18 + 0.02, 0.14, b, 0.3, "glass", decay=9.0)
write("attention", echo(buf, 0.11, 0.3, 1.0))

# done: aufsteigender Dur-Dreiklang
buf = blank(0.85)
for i, freq in enumerate([1046.5, 1318.5, 1568.0, 2093.0]):
    note(buf, i * 0.075, 0.42 - i * 0.05, freq, 0.42, "glass", decay=6.5)
write("done", echo(buf, 0.1, 0.32, 1.0))

# error: zwei fallende, leicht kaputte Töne
buf = blank(0.65)
random.seed(7)
note(buf, 0.0, 0.18, 330, 0.5, "soft-square", decay=4.0, glide=-0.08)
note(buf, 0.2, 0.3, 233, 0.5, "soft-square", decay=4.0, glide=-0.12)
for i in range(int(0.12 * RATE)):
    j = int(0.2 * RATE) + i
    if (i // 90) % 3 == 0:
        buf[j] += (random.random() * 2 - 1) * 0.12 * math.exp(-8 * i / RATE)
write("error", buf, peak=0.5)

# message: einzelnes weiches Blip
buf = blank(0.35)
note(buf, 0.0, 0.16, 1760, 0.5, "sine", decay=14.0, glide=-0.05)
note(buf, 0.05, 0.16, 2637, 0.25, "sine", decay=16.0)
write("message", echo(buf, 0.08, 0.3, 1.0), peak=0.45)
