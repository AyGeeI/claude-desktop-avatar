#!/usr/bin/env python3
"""Erzeugt die Pixelvorlage "Vela" (templates/vela/pixel.json) samt Vorschau.

Vela ist eine eigene Figur dieses Projekts: eine holografische Netz-KI im
Neon-Stil, asymmetrischer Bob (links ausrasiert, rechts lang mit
Farbsträhne), leuchtende Augen, Schaltkreis-Tattoo, hoher Kragen und ein
Projektionsring. Alle Frames entstehen hier aus Ebenen, damit man die Figur
nachvollziehbar ändern kann:

    python3 tools/make-vela.py            # schreibt pixel.json
    python3 tools/make-vela.py --preview  # zusätzlich PNG-Vorschauen (Pillow)
    python3 tools/make-vela.py --preview --icon  # dazu .claude-plugin/icon.png

Lizenz der Grafik: CC BY 4.0 (siehe templates/vela/LICENSE).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

W, H = 32, 40
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "templates" / "vela"

# ---------------------------------------------------------------- Palette
# Zeichen → Farbe. Einträge mit "param" folgen den Parametern der Vorlage.
PALETTE: dict[str, object] = {
    ".": "transparent",
    "k": "#0a0818",  # Kontur
    "h": {"param": "hair"},
    "H": {"param": "hair", "shade": -0.45},
    "i": {"param": "hair", "shade": 0.3},
    "q": {"param": "streak"},
    "Q": {"param": "streak", "shade": -0.35},
    "s": {"param": "skin"},
    "S": {"param": "skin", "shade": -0.28},
    "T": {"param": "skin", "shade": -0.5},
    "l": {"param": "skin", "shade": 0.4},
    "e": {"param": "eyes"},
    "E": {"param": "eyes", "shade": 0.7},
    "u": {"param": "eyes", "shade": -0.4},
    "m": {"param": "accent", "shade": -0.25},
    "M": {"param": "accent", "shade": -0.7},
    "b": {"param": "accent", "alpha": 0.45},
    "a": {"param": "accent"},
    "c": {"param": "accent", "shade": 0.15, "alpha": 0.9},
    "j": {"param": "jacket"},
    "J": {"param": "jacket", "shade": -0.45},
    "g": {"param": "jacket", "shade": 0.3},
    "n": {"param": "glow"},
    "N": {"param": "glow", "shade": 0.6},
    "r": {"param": "glow", "alpha": 0.55},
    "R": {"param": "glow", "alpha": 0.9},
    "f": {"param": "glow", "alpha": 0.28},
    "d": {"param": "glow", "alpha": 0.8},
    "D": {"param": "glow", "shade": 0.5, "alpha": 0.95},
    "v": {"param": "glow", "alpha": 0.5},
    "V": {"param": "glow", "shade": 0.45},
    "w": "#ffffff",
    "y": "#ffd23f",
    "Y": "#fff3b0",
    "x": "#ff3b5c",
    "X": "#ff9aae",
    "z": {"param": "glow", "shade": 0.35},
}

# ---------------------------------------------------------------- Ebenen
# Jede Ebene: 40 Zeilen à 32 Zeichen, "." = durchsichtig.


def layer(text: str) -> list[str]:
    rows = [row for row in text.strip("\n").split("\n")]
    rows = [row.split("|")[1] if "|" in row else row for row in rows]
    if len(rows) != H:
        raise SystemExit(f"Ebene hat {len(rows)} statt {H} Zeilen")
    for y, row in enumerate(rows):
        if len(row) != W:
            raise SystemExit(f"Zeile {y}: {len(row)} statt {W} Zeichen: {row!r}")
        for ch in row:
            if ch not in PALETTE:
                raise SystemExit(f"Zeile {y}: unbekanntes Zeichen {ch!r}")
    return rows



def spans(rows: dict[int, list[tuple[int, str]]]) -> list[str]:
    """Baut eine Ebene aus Zeilenstücken: {y: [(x, "zeichen"), ...]}."""
    canvas = [["."] * W for _ in range(H)]
    for y, parts in rows.items():
        for x, text in parts:
            for i, ch in enumerate(text):
                if 0 <= x + i < W:
                    canvas[y][x + i] = ch
    return layer("\n".join("".join(row) for row in canvas))


S12 = "s" * 12
BODY = spans({
    3: [(12, "kkkkkkkk")],
    4: [(10, "kk"), (12, "hhhhhhhh"), (20, "kk")],
    5: [(9, "k"), (10, "hhhhhhhihhhh"), (22, "k")],
    6: [(8, "k"), (9, "hhhhhhhhhiihhh"), (23, "k")],
    7: [(7, "k"), (8, "hhhhqqhhhhhhihhh"), (24, "k")],
    8: [(7, "k"), (8, "Hhhhhhqqhhhhhhihh"), (25, "k")],
    9: [(6, "k"), (7, "HHhhhhhhqqhhhhhhihh"), (26, "k")],
    10: [(6, "k"), (7, "HHHhhhhhhhhqhhhhhhH"), (26, "k")],
    11: [(6, "k"), (7, "HqH"), (10, "lsssss"), (16, "hhhqhhhhh"), (25, "H"), (26, "k")],
    12: [(6, "k"), (7, "HqH"), (10, "sssssss"), (17, "hhhqhhhh"), (25, "H"), (26, "k")],
    13: [(6, "k"), (7, "HHH"), (10, "sssssssss"), (19, "hhqhhh"), (25, "H"), (26, "k")],
    14: [(7, "k"), (8, "sS"), (10, S12), (22, "hqh"), (25, "H"), (26, "k")],
    15: [(7, "k"), (8, "sS"), (10, S12), (22, "hqh"), (25, "H"), (26, "k")],
    16: [(7, "k"), (8, "sS"), (10, S12), (22, "hqh"), (25, "H"), (26, "k")],
    17: [(7, "k"), (8, "Ss"), (10, "S" + "s" * 10 + "S"), (22, "hqh"), (25, "H"), (26, "k")],
    18: [(8, "k"), (9, "S"), (10, "S" + "s" * 10 + "S"), (22, "hhq"), (25, "H"), (26, "k")],
    19: [(9, "k"), (10, "S" + "s" * 10 + "S"), (22, "hhq"), (25, "H"), (26, "k")],
    20: [(9, "k"), (10, "S" + "s" * 10 + "S"), (22, "hhq"), (25, "H"), (26, "k")],
    21: [(10, "k"), (11, "S" + "s" * 8 + "S"), (21, "hhhqH"), (26, "k")],
    22: [(11, "k"), (12, "S" + "s" * 6 + "S"), (20, "hhhhqH"), (26, "k")],
    23: [(12, "k"), (13, "SssssS"), (19, "hhhhhqH"), (26, "k")],
    24: [(14, "kkkk"), (20, "hhhhqH"), (26, "k")],
    25: [(14, "SSSS"), (20, "hhhhqH"), (26, "k")],
    26: [(13, "k"), (14, "nNnn"), (18, "k"), (21, "hhhqH"), (26, "k")],
    27: [(11, "k"), (12, "j"), (13, "n"), (14, "SssS"), (18, "n"), (19, "j"), (20, "k"), (21, "hhhqH"), (26, "k")],
    28: [(7, "k"), (8, "jjjgg"), (13, "g"), (14, "n"), (15, "sS"), (17, "n"), (18, "g"), (19, "gg"), (21, "hhhqH"), (26, "k")],
    29: [(5, "k"), (6, "jjjjjjggg"), (15, "nn"), (17, "ggjjjj"), (22, "hhqH"), (26, "kk")],
    30: [(4, "k"), (5, "Jjjjjjjjjgg"), (16, "g"), (17, "gjjjjjj"), (23, "hqH"), (26, "jJk")],
    31: [(4, "k"), (5, "Jjjjjnjjjjj"), (16, "J"), (17, "jjjjjjjjjJ"), (24, "hH"), (27, "k")],
    32: [(4, "k"), (5, "JjjjnNnjjjj"), (16, "J"), (17, "jjjjjjjjjJ"), (27, "k")],
    33: [(4, "k"), (5, "JJjjjnjjjjj"), (16, "J"), (17, "jjjjjjjjJJ"), (27, "k")],
    34: [(5, "JJJjjjjjjjjJjjjjjjjjjJJJ"[:22])],
    35: [(5, "fJJJJjjjjjjJjjjjjjJJJJf"[:22])],
    36: [(6, "ffJJJJJJJJJJJJJJJJJff"[:20])],
})

# Projektionsring unter der Büste, drei Leuchtstufen für die Animation.
RING = [
    layer("""
 0|................................|
 1|................................|
 2|................................|
 3|................................|
 4|................................|
 5|................................|
 6|................................|
 7|................................|
 8|................................|
 9|................................|
10|................................|
11|................................|
12|................................|
13|................................|
14|................................|
15|................................|
16|................................|
17|................................|
18|................................|
19|................................|
20|................................|
21|................................|
22|................................|
23|................................|
24|................................|
25|................................|
26|................................|
27|................................|
28|................................|
29|................................|
30|................................|
31|................................|
32|................................|
33|................................|
34|................................|
35|................................|
36|................................|
37|.....rr....................rr...|
38|......rrrrrRRRRRRRRRRrrrrrrr....|
39|..........rrrrrrrrrrrrr.........|
"""),
    layer("""
 0|................................|
 1|................................|
 2|................................|
 3|................................|
 4|................................|
 5|................................|
 6|................................|
 7|................................|
 8|................................|
 9|................................|
10|................................|
11|................................|
12|................................|
13|................................|
14|................................|
15|................................|
16|................................|
17|................................|
18|................................|
19|................................|
20|................................|
21|................................|
22|................................|
23|................................|
24|................................|
25|................................|
26|................................|
27|................................|
28|................................|
29|................................|
30|................................|
31|................................|
32|................................|
33|................................|
34|................................|
35|................................|
36|................................|
37|.....rR....................Rr...|
38|......rrrRRRRNNNNNNRRRRRrrrr....|
39|..........rrrRRRRRRRrrr.........|
"""),
]


def blank() -> list[list[str]]:
    return [["."] * W for _ in range(H)]


def stamp(canvas: list[list[str]], rows: list[str] | list[list[str]], dx: int = 0, dy: int = 0) -> None:
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            tx, ty = x + dx, y + dy
            if 0 <= tx < W and 0 <= ty < H:
                canvas[ty][tx] = ch


def put(canvas: list[list[str]], x: int, y: int, art: str, dy: int = 0) -> None:
    """Setzt eine kleine Grafik (Zeilen durch "/" getrennt) an x, y."""
    for row_i, row in enumerate(art.split("/")):
        for col_i, ch in enumerate(row):
            if ch == ".":
                continue
            tx, ty = x + col_i, y + row_i + dy
            if 0 <= tx < W and 0 <= ty < H:
                canvas[ty][tx] = ch


def to_rows(canvas: list[list[str]]) -> list[str]:
    return ["".join(row) for row in canvas]


# ---------------------------------------------------------------- Gesichtsteile
# Koordinaten relativ zur Büste (dy verschiebt den ganzen Kopf beim "Schweben").
EYE_Y = 14
MOUTH_X, MOUTH_Y = 13, 20

EYES = {
    # Mandelform: Lidstrich mit Lidwinkel außen, helle Lederhaut außen, Iris innen
    "open": (".kkk/kwEe/.wee", "kkk./eEwk/eew."),
    "look-up": (".kkk/kwwE/.wwe", "kkk./wwEk/wwe."),
    "look-left": (".kkk/kEew/.eew", "kkk./Eewk/eew."),
    "look-down": ("..../.kkk/kwEe", "..../kkk./eEwk"),
    "wide": (".kkk/kwEe/.wee/..w.", "kkk./eEwk/eew./.w.."),
    "half": ("..../.kkk/kwEe", "..../kkk./eEwk"),
    "closed": ("..../.kkk/k...", "..../kkk./...k"),
    "happy": ("..../.kk./k..k", "..../.kk./k..k"),
    "angry": ("k.../.kkk/kwEe", "...k/kkk./eEwk"),
    "x": ("k..k/.kk./k..k", "k..k/.kk./k..k"),
    "sleep": ("..../..../kkkk", "..../..../kkkk"),
}

# Mundformen (6×3 um den Mund; Hautpixel decken den Grundmund ab).
MOUTHS = {
    "closed": "ssssss/smmmms/ssssss",
    "half": "ssssss/smMMms/sssmss",
    "open": "smmmms/sMMMMs/ssmmss",
    "round": "ssmmss/smMMms/ssmmss",
    "smile": "msssm./smmmms/ssssss",
    "grin": "smmmms/sMwwMs/ssmmss",
    "frown": "ssssss/ssmmss/smsssm",
    "flat": "ssssss/ssmmms/ssssss",
    "small": "ssssss/ssmmss/ssssss",
    "o": "ssssss/ssmMs./ssmss.",
}


def face(canvas: list[list[str]], eyes: str, mouth: str, dy: int = 0, blush: bool = False, brows: str = "") -> None:
    left, right = EYES[eyes]
    put(canvas, 10, EYE_Y, left, dy)
    put(canvas, 18, EYE_Y, right, dy)
    # Augenbraue (die rechte liegt unter dem Pony)
    if brows == "up":
        put(canvas, 11, 11, "HHH", dy)
    elif brows == "down":
        put(canvas, 11, 12, "H../.HH", dy)
    else:
        put(canvas, 11, 12, "HHH", dy)
    # Nase
    put(canvas, 15, 17, "l./.S", dy)
    put(canvas, MOUTH_X, MOUTH_Y - 1, MOUTHS[mouth], dy)
    if blush:
        put(canvas, 11, 18, "bb", dy)
        put(canvas, 19, 18, "bb", dy)


def figure(eyes: str = "open", mouth: str = "closed", dy: int = 0, ring: int = 0, blush: bool = False, brows: str = "") -> list[list[str]]:
    canvas = blank()
    stamp(canvas, BODY, 0, dy)
    face(canvas, eyes, mouth, dy, blush, brows)
    stamp(canvas, RING[ring % len(RING)])
    return canvas


# ---------------------------------------------------------------- Beiwerk


def dots(canvas: list[list[str]], lit: int) -> None:
    for i in range(3):
        ch = "D" if i == lit else "r"
        put(canvas, 24 + i * 3, 3, f"{ch}{ch}/{ch}{ch}")


def holo_panel(canvas: list[list[str]], phase: int) -> None:
    """Schwebendes Datenfenster links neben dem Kopf; die Textzeilen laufen nach oben."""
    put(canvas, 0, 9, "rrrrrr/r....r/r....r/r....r/r....r/r....r/r....r/r....r/r....r/rrrrrr")
    lines = ["dddd", "", "dDd.", "", "ddd.", "", "dd.D", "", "dddd", "", "d.dd", ""]
    for row in range(8):
        text = lines[(row + phase * 2) % len(lines)]
        if text:
            put(canvas, 1, 10 + row, text)
    put(canvas, 1, 19, ".rr.")


def eq_bars(canvas: list[list[str]], phase: int) -> None:
    heights = [[2, 4, 3], [4, 2, 5], [3, 5, 2], [5, 3, 4]][phase % 4]
    for i, height in enumerate(heights):
        for k in range(height):
            put(canvas, 27 + i * 2, 20 - k, "d" if k < height - 1 else "D")


def alert(canvas: list[list[str]], bright: bool) -> None:
    """Warndreieck mit Ausrufezeichen über dem Kopf."""
    c, C = ("y", "Y") if bright else ("y", "y")
    put(canvas, 24, 0, f"...{c}.../..{c}{C}{c}../..{c}k{c}../.{c}{C}k{C}{c}./.{c}{C}{C}{C}{c}./{c}{C}{C}k{C}{C}{c}/{c}{c}{c}{c}{c}{c}{c}")


def sparkle(canvas: list[list[str]], phase: int) -> None:
    if phase == 0:
        put(canvas, 4, 3, ".w./wNw/.w.")
        put(canvas, 26, 6, "N")
    elif phase == 1:
        put(canvas, 4, 3, "...N.../...N.../.NNwNN./...N.../...N...")
        put(canvas, 25, 5, ".w./wNw/.w.")
    else:
        put(canvas, 5, 4, "N")
        put(canvas, 26, 6, ".N./NwN/.N.")


def warn(canvas: list[list[str]], phase: int) -> None:
    if phase % 2 == 0:
        put(canvas, 25, 1, "x...x/.x.x./..x../.x.x./x...x")
    else:
        put(canvas, 25, 1, "X...X/.X.X./..X../.X.X./X...X")


def zzz(canvas: list[list[str]], phase: int) -> None:
    positions = [(23, 7), (25, 4), (27, 1)]
    for i, (x, y) in enumerate(positions):
        if (phase + i) % 3 == 2:
            continue
        put(canvas, x, y, "zzz/..z/.z./zzz" if i > 0 else "zz/.z/zz")


# ---------------------------------------------------------------- Frames

frames: dict[str, list[str]] = {}
states: dict[str, dict[str, object]] = {}


def add(name: str, canvas: list[list[str]]) -> str:
    frames[name] = to_rows(canvas)
    return name


# idle: blinzeln, Ring pulsiert (das Schweben macht das Desktop-Fenster weich)
idle = [
    add("idle-0", figure("open", "closed", 0, 0)),
    add("idle-1", figure("open", "closed", 0, 1)),
    add("idle-2", figure("open", "closed", 0, 1)),
    add("idle-3", figure("closed", "closed", 0, 0)),
    add("idle-4", figure("open", "closed", 0, 0)),
    add("idle-5", figure("open", "small", 0, 1)),
]
states["idle"] = {"frames": idle, "fps": 3}

thinking = []
for i in range(3):
    canvas = figure("look-up", "flat", 0, i % 2, brows="up")
    dots(canvas, i)
    thinking.append(add(f"thinking-{i}", canvas))
states["thinking"] = {"frames": thinking, "fps": 4}

working = []
for i in range(4):
    canvas = figure("look-left" if i % 2 == 0 else "look-down", "flat", 0, i % 2)
    holo_panel(canvas, i)
    working.append(add(f"working-{i}", canvas))
states["working"] = {"frames": working, "fps": 5}

speaking = []
for i, mouth in enumerate(["half", "open", "round", "closed", "open", "half"]):
    canvas = figure("open" if i != 3 else "half", mouth, 0, i % 2)
    eq_bars(canvas, i)
    speaking.append(add(f"speaking-{i}", canvas))
states["speaking"] = {"frames": speaking, "fps": 7}

attention = []
for i in range(2):
    canvas = figure("wide", "o", 0, i, brows="up")
    alert(canvas, i == 0)
    attention.append(add(f"attention-{i}", canvas))
states["attention"] = {"frames": attention, "fps": 3}

success = []
for i in range(3):
    canvas = figure("happy", "grin" if i == 1 else "smile", 0, i % 2, blush=True)
    sparkle(canvas, i)
    success.append(add(f"success-{i}", canvas))
states["success"] = {"frames": success, "fps": 4}

error = []
for i in range(3):
    canvas = figure("x" if i == 1 else "angry", "frown", 0, i % 2, brows="down")
    warn(canvas, i)
    error.append(add(f"error-{i}", canvas))
states["error"] = {"frames": error, "fps": 6}

sleeping = []
for i in range(3):
    canvas = figure("sleep", "small", 0, i % 2)
    zzz(canvas, i)
    sleeping.append(add(f"sleeping-{i}", canvas))
states["sleeping"] = {"frames": sleeping, "fps": 2}

# Mundformen fürs Lippensynchron-Sprechen im Desktop-Fenster
mouth_frames = {}
for shape in ("closed", "half", "open", "round"):
    canvas = blank()
    put(canvas, MOUTH_X, MOUTH_Y - 1, MOUTHS[shape])
    mouth_frames[shape] = add(f"mouth-{shape}", canvas)

# Overlays für Parameter
visor_band = blank()
put(visor_band, 9, 14, "VvvvvvvvvvvvvV/VvvvvvvvvvvvvV")
add("ov-visor-band", visor_band)
visor_half = blank()
put(visor_half, 16, 13, "VVVVVV/vvvvvV/vvvvvV/.VVVV.")
add("ov-visor-half", visor_half)
earring = blank()
put(earring, 6, 18, ".n./n.n/.N.")
add("ov-earring", earring)
tattoo = blank()
put(tattoo, 10, 18, "c../.c./.cc")
add("ov-tattoo", tattoo)

pixel = {
    "width": W,
    "height": H,
    "palette": PALETTE,
    "frames": frames,
    "states": states,
    "overlays": {
        "visor": {"band": ["ov-visor-band"], "half": ["ov-visor-half"]},
        "earring": {"true": ["ov-earring"]},
        "tattoo": {"true": ["ov-tattoo"]},
    },
    "mouth": mouth_frames,
    "effects": {
        "scanlines": True,
        "flicker": True,
        "glitch": ["error"],
        "dim": ["sleeping"],
        "glow": {"param": "glow"},
    },
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "pixel.json").write_text(json.dumps(pixel, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(frames)} Frames → {OUT / 'pixel.json'}")

# ---------------------------------------------------------------- Vorschau

if "--preview" in sys.argv:
    from PIL import Image, ImageDraw

    manifest = json.loads((OUT / "avatar.json").read_text(encoding="utf-8")) if (OUT / "avatar.json").exists() else {}
    params = {key: spec["default"] for key, spec in manifest.get("parameters", {}).items()}
    params.setdefault("hair", "#3b2a7a")
    params.setdefault("streak", "#ff2bd6")
    params.setdefault("skin", "#bfe9f2")
    params.setdefault("eyes", "#00f0ff")
    params.setdefault("accent", "#ff2bd6")
    params.setdefault("jacket", "#1a1c3a")
    params.setdefault("glow", "#00e5ff")
    for arg in sys.argv:
        if arg.startswith("--set="):
            key, value = arg[6:].split("=", 1)
            params[key] = value == "true" if value in ("true", "false") else value

    def rgba(entry: object) -> tuple[int, int, int, int]:
        if isinstance(entry, str):
            if entry == "transparent":
                return (0, 0, 0, 0)
            r, g, b = int(entry[1:3], 16), int(entry[3:5], 16), int(entry[5:7], 16)
            a = int(entry[7:9], 16) if len(entry) == 9 else 255
            return (r, g, b, a)
        assert isinstance(entry, dict)
        value = params.get(entry["param"], "#ffffff")
        r, g, b, _ = rgba(value if isinstance(value, str) else "#ffffff")
        shade = float(entry.get("shade", 0))
        target = 255 if shade >= 0 else 0
        f = abs(shade)
        r, g, b = (round(c + (target - c) * f) for c in (r, g, b))
        return (r, g, b, round(255 * float(entry.get("alpha", 1))))

    colors = {ch: rgba(entry) for ch, entry in PALETTE.items()}

    def overlays_for() -> list[str]:
        out = []
        for param, by_value in pixel["overlays"].items():
            value = params.get(param, manifest.get("parameters", {}).get(param, {}).get("default"))
            key = str(value).lower() if isinstance(value, bool) else str(value)
            out += by_value.get(key, [])
        return out

    def render(names: list[str], scale: int) -> Image.Image:
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        px = img.load()
        for name in names:
            for y, row in enumerate(frames[name]):
                for x, ch in enumerate(row):
                    c = colors[ch]
                    if c[3] == 0:
                        continue
                    base = px[x, y]
                    a = c[3] / 255
                    px[x, y] = tuple(round(c[i] * a + base[i] * (1 - a)) for i in range(3)) + (max(base[3], c[3]),)
        return img.resize((W * scale, H * scale), Image.NEAREST)

    scale = 6
    order = list(states.keys())
    cols = max(len(states[s]["frames"]) for s in order)
    sheet = Image.new("RGBA", (cols * W * scale + 20, len(order) * (H * scale + 18) + 10), (12, 10, 26, 255))
    draw = ImageDraw.Draw(sheet)
    ov = overlays_for()
    for row, state in enumerate(order):
        y0 = 10 + row * (H * scale + 18)
        draw.text((10, y0 - 2), state, fill=(150, 220, 255, 255))
        for col, name in enumerate(states[state]["frames"]):
            img = render([name, *ov], scale)
            sheet.alpha_composite(img, (10 + col * W * scale, y0 + 10))
    target = Path(next((a[10:] for a in sys.argv if a.startswith("--out-dir=")), str(OUT)))
    sheet.save(target / "preview-sheet.png")
    hero = Image.new("RGBA", (W * 8 + 32, H * 8 + 32), (12, 10, 26, 255))
    hero.alpha_composite(render(["idle-0", *ov], 8), (16, 16))
    hero.save(target / "preview.png")
    print("Vorschau:", target / "preview-sheet.png", target / "preview.png")

if "--icon" in sys.argv:
    from PIL import Image, ImageDraw, ImageFilter

    # Symbolbild der Mod: Vela auf dunklem Grund mit Leuchthof und Scanlines.
    size = 1024
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = Image.new("L", (size, size), 0)
    ImageDraw.Draw(plate).rounded_rectangle((0, 0, size - 1, size - 1), radius=200, fill=255)
    bg = Image.new("RGBA", (size, size), (13, 10, 30, 255))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((170, 120, 854, 804), fill=(0, 229, 255, 90))
    gd.ellipse((330, 300, 1000, 970), fill=(255, 43, 214, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    bg.alpha_composite(glow)
    sprite = render(["idle-0", *ov], 1)
    sprite = sprite.crop((0, 2, W, 39))
    scale = 24
    big = sprite.resize((sprite.width * scale, sprite.height * scale), Image.NEAREST)
    lines = Image.new("RGBA", big.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    for y in range(0, big.height, scale // 2):
        ld.rectangle((0, y + scale // 2 - 3, big.width, y + scale // 2 - 1), fill=(0, 0, 0, 46))
    mask = big.split()[3]
    shaded = Image.composite(lines, Image.new("RGBA", big.size, (0, 0, 0, 0)), mask)
    big.alpha_composite(shaded)
    bg.alpha_composite(big, ((size - big.width) // 2, size - big.height - 40))
    icon.paste(bg, (0, 0), plate)
    icon = icon.resize((512, 512), Image.LANCZOS)
    (ROOT / ".claude-plugin").mkdir(exist_ok=True)
    icon.save(ROOT / ".claude-plugin" / "icon.png", optimize=True)
    print("Symbol:", ROOT / ".claude-plugin" / "icon.png")
