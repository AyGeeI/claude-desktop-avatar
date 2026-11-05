# Avatar-Vorlagen – Format & Anpassung (Entwurf v0.3)

> Teil des [Projektplans](PLAN.md) · Stand: 5. November 2026 (v0.3: Vorlagen für die Mod, Vektor und Pixel).
> Dieses Dokument beschreibt, wie der Avatar aussieht und sich bewegt, wie du ihn anpasst und wie du eigene Vorlagen baust. Das Format wird in Phase 3 als v1 festgeschrieben.

## 1. Ziele

- **Anpassen ohne Code:** Vorlage, Farben, Teile, Name, Stimme und Stil wählst du mit `/avatar aussehen` in der Seitenleiste, mit Live-Vorschau.
- **Eigene Vorlagen ohne Änderung an der Mod:** Eine Vorlage ist ein Ordner mit einer `avatar.json`, einer SVG-Datei und einer Pixel-Datei.
- **Passend zur Oberfläche:** Jede Vorlage hat zwei Darstellungen: eine Vektorgrafik (SVG) für die Desktop-App, VS Code und Mobil und Pixel-Art für das Terminal. Fehlt eine, zeigt die Mod dort einen schlichten Ersatz-Avatar.
- **Zweisprachig:** Namen, Beschriftungen und Begrüßungen auf Deutsch und Englisch.
- **Sicher:** Vorlagen sind reine Daten. Die Mod führt nichts aus einer Vorlage aus.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Vorlage** (Template) | Gestaltung, Animationen und anpassbare Parameter |
| **Parameter** | ein Regler der Vorlage: Farbe, Auswahl, Schalter oder Zahl |
| **Profil** | deine Ausprägung: Vorlage, gewählte Werte, Name, Stimmen, Stil. Liegt in `$.store` |
| **SVG-Darstellung** | Vektorgrafik mit CSS-Animation, gezeichnet über das Element `Svg` |
| **Pixel-Darstellung** | Pixel-Raster aus Textzeilen, im Terminal gezeichnet über `Raster` |
| **Zustand** | was der Avatar gerade „tut": `idle`, `thinking`, `speaking` … |
| **Overlay** | was die Mod unabhängig von der Vorlage darüberlegt: Badge, Fortschritt |

## 3. Ordnerstruktur

```text
mein-avatar/
├── avatar.json          # Manifest (Pflicht)
├── avatar.svg           # SVG-Darstellung (empfohlen)
├── pixel.json           # Pixel-Darstellung (empfohlen)
├── sounds/              # optionale Hinweistöne (WAV)
│   ├── attention.wav
│   └── done.wav
├── LICENSE              # Lizenz für Grafiken und Töne
└── README.md            # optional
```

- **Mitgelieferte Vorlagen** liegen im Plugin unter `templates/`.
- **Eigene Vorlagen** liegen unter `%USERPROFILE%\.claude-desktop-avatar\templates\<id>\`. Während die Anpassen-Ansicht offen ist, lädt die Mod sie bei jeder Änderung neu.

## 4. Manifest `avatar.json`

```json
{
  "formatVersion": 1,
  "id": "cda.blob",
  "version": "1.0.0",
  "name": { "de": "Blob", "en": "Blob" },
  "description": {
    "de": "Ein freundlicher, wabbeliger Begleiter.",
    "en": "A friendly, wobbly companion."
  },
  "author": "Claude Desktop Avatar",
  "license": "CC-BY-4.0",
  "parameters": {
    "bodyColor": {
      "type": "color",
      "label": { "de": "Körperfarbe", "en": "Body color" },
      "default": "#E07A5F",
      "palette": ["#E07A5F", "#0F766E", "#2563EB", "#9333EA"]
    },
    "eyes": {
      "type": "choice",
      "label": { "de": "Augen", "en": "Eyes" },
      "default": "round",
      "options": [
        { "id": "round", "label": { "de": "Rund", "en": "Round" } },
        { "id": "happy", "label": { "de": "Fröhlich", "en": "Happy" } }
      ]
    },
    "accessory": {
      "type": "choice",
      "label": { "de": "Accessoire", "en": "Accessory" },
      "default": "none",
      "options": [
        { "id": "none", "label": { "de": "Keins", "en": "None" } },
        { "id": "headphones", "label": { "de": "Kopfhörer", "en": "Headphones" } }
      ]
    },
    "wobble": {
      "type": "range",
      "label": { "de": "Wabbeln", "en": "Wobble" },
      "default": 0.5,
      "min": 0,
      "max": 1,
      "step": 0.1
    }
  },
  "states": {
    "idle": {},
    "thinking": { "fallback": "idle" },
    "working": { "fallback": "thinking" },
    "speaking": { "fallback": "idle" },
    "attention": { "fallback": "idle" },
    "success": { "once": true, "duration": 1600, "fallback": "idle" },
    "error": { "once": true, "duration": 1200, "fallback": "idle" },
    "sleeping": { "fallback": "idle" }
  },
  "svg": { "file": "avatar.svg", "width": 160, "height": 160 },
  "pixel": { "file": "pixel.json" },
  "sounds": { "attention": "sounds/attention.wav", "done": "sounds/done.wav" },
  "voice": { "de": "Microsoft Hedda Desktop", "en": "Microsoft Zira Desktop" },
  "persona": {
    "displayName": { "de": "Blob", "en": "Blob" },
    "greeting": { "de": "Hallo! Wobei kann ich helfen?", "en": "Hi! How can I help?" },
    "style": "friendly"
  }
}
```

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `formatVersion` | ja | Version dieses Formats (aktuell `1`) |
| `id` | ja | eindeutige ID in Kleinbuchstaben, z. B. `max.robo` |
| `version` | ja | Version der Vorlage nach SemVer |
| `name`, `description` | `name` ja | mehrsprachig: `{ "de": "…", "en": "…" }` |
| `author`, `license` | ja | Lizenz als SPDX-Kennung, z. B. `CC-BY-4.0` |
| `parameters` | nein | anpassbare Regler (Abschnitt 5) |
| `states` | ja (mindestens `idle`) | unterstützte Zustände (Abschnitt 6) |
| `svg` | empfohlen | SVG-Datei und Anzeigegröße in CSS-Pixeln (Abschnitt 7) |
| `pixel` | empfohlen | Pixel-Datei (Abschnitt 8) |
| `sounds` | nein | eigene Hinweistöne als WAV (Abschnitt 9) |
| `voice`, `persona` | nein | Vorschläge für Stimmen und Persönlichkeit; das Profil kann sie überschreiben (Abschnitt 9) |

## 5. Parameter

| Typ | Element in der Anpassen-Ansicht | SVG | Pixel |
|---|---|---|---|
| `color` | Farbknöpfe aus `palette`, dazu ein Feld für eigene Werte | CSS-Variable `--p-<id>` | Farbe in der Palette (`{ "param": "<id>" }`) |
| `choice` | Auswahl | Klasse `p-<id>-<wert>` am Wurzelelement | Overlay-Frames je Wert |
| `toggle` | Schalter | Klasse `p-<id>` am Wurzelelement | Overlay-Frames, wenn an |
| `range` | Auswahl in Stufen (`step`) | CSS-Variable `--p-<id>` | wird ignoriert |

- Jeder Parameter hat `label` und `default`. `choice` hat zusätzlich `options` mit ASCII-`id` und `label`.
- **Texte:** empfohlen sind `de` und `en`. Fehlt die Sprache der Oberfläche, nimmt die Mod `en`, dann `de`, dann die erste vorhandene; die Prüfung warnt, wenn eine der beiden fehlt.

## 6. Zustände

| Zustand | Bedeutung | Auslöser | Standard-Fallback |
|---|---|---|---|
| `idle` | Ruhe, gelegentliches Blinzeln | keiner der anderen | – (Pflicht) |
| `thinking` | Claude denkt nach | Prompt gesendet, noch kein Werkzeug | `idle` |
| `working` | Claude arbeitet | Werkzeug läuft | `thinking` |
| `speaking` | der Avatar spricht | Ansage oder Vorlesen läuft | `idle` |
| `attention` | braucht dich | Freigabe nötig | `idle` (+ Badge „!") |
| `success` | fertig (einmalig) | Runde beendet | `idle` |
| `error` | Fehler (einmalig) | Abbruch, Fehler | `idle` |
| `sleeping` | schläft | lange inaktiv, „Still" | `idle` |

- **Eigenschaften:** `once` + `duration` in ms (einmalig, danach zurück), `fallback` (Ersatz, wenn die Vorlage den Zustand nicht gestaltet).
- **Priorität**, wenn mehreres zutrifft: `speaking` > `attention` > `thinking` > `working` > `success`/`error` > `sleeping` > `idle`.
- **Kein Lippen-Sync nach Lautstärke:** Die Mod kennt das Audiosignal nicht. `speaking` zeigt eine Sprech-Animation, solange gesprochen wird.

## 7. SVG-Darstellung

- **Eine eigenständige SVG-Datei** mit eingebettetem `<style>`, ohne externe Dateien, Schriften oder Bilder.
- **Was die Mod einsetzt:** Sie ergänzt nur das Wurzelelement `<svg …>`:
  - `class`: `avatar`, `state-<zustand>` sowie `p-<id>-<wert>` für Auswahl- und `p-<id>` für eingeschaltete Schalter-Parameter, dazu `reduced-motion`, wenn Animationen aus sind
  - `style`: die CSS-Variablen `--p-<id>` für Farb- und Zahlen-Parameter
- **Animation:** reine CSS- oder SMIL-Animation. In der Desktop-App zeichnet Claude Code das SVG in einem Sandbox-Rahmen, in dem Animationen laufen, Skripte aber nicht. Die Mod zeichnet nur neu, wenn sich der Zustand ändert.
- **Grenzen:** höchstens 131.072 Zeichen nach dem Einsetzen. Kein `<script>`, keine Event-Attribute, keine externen Verweise; Claude Code entfernt so etwas ohnehin, die Mod lehnt es vorher ab.
- **VS Code** zeigt das SVG als Bild: Animationen laufen, Hover-Effekte nicht.

Ausschnitt `avatar.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <style>
    .body { fill: var(--p-bodyColor); }
    .eye, .mouth { fill: #1f1f24; }
    .eyes { display: none; }
    .p-eyes-round .eyes-round, .p-eyes-happy .eyes-happy { display: inline; }
    .acc { display: none; }
    .p-accessory-headphones .acc-headphones { display: inline; }

    .eyes { animation: blink 5s infinite; transform-box: fill-box; transform-origin: center; }
    .state-idle .body-group { animation: float 4s ease-in-out infinite; }
    .state-thinking .body-group, .state-working .body-group { animation: pulse 1.2s ease-in-out infinite; }
    .state-speaking .mouth { animation: talk 0.3s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
    .reduced-motion * { animation: none !important; }

    @keyframes blink { 0%, 95%, 100% { transform: scaleY(1); } 97% { transform: scaleY(0.1); } }
    @keyframes float { 50% { transform: translateY(calc(-6px * (0.5 + var(--p-wobble)))); } }
    @keyframes pulse { 50% { transform: scale(1.04); } }
    @keyframes talk { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }
  </style>
  <g class="body-group">
    <path class="body" d="M128 28c58 0 96 46 96 104s-38 96-96 96-96-38-96-96 38-104 96-104z"/>
    <g class="eyes eyes-round">
      <circle class="eye" cx="98" cy="122" r="13"/>
      <circle class="eye" cx="158" cy="122" r="13"/>
    </g>
    <g class="eyes eyes-happy">
      <path d="M84 126q14-16 28 0M144 126q14-16 28 0" fill="none" stroke="#1f1f24" stroke-width="6" stroke-linecap="round"/>
    </g>
    <ellipse class="mouth" cx="128" cy="172" rx="16" ry="10"/>
    <g class="acc acc-headphones"><!-- Kopfhörer --></g>
  </g>
</svg>
```

## 8. Pixel-Darstellung

Im Terminal zeichnet die Mod den Avatar als Raster aus Zeichenzellen. Jede Zelle zeigt zwei übereinanderliegende Pixel als Halbblock (`▀`) mit Vorder- und Hintergrundfarbe. Ein Avatar mit 32 × 32 Pixeln belegt so 32 Spalten und 16 Zeilen.

`pixel.json`:

```json
{
  "width": 16,
  "height": 16,
  "palette": {
    ".": "transparent",
    "k": "#1f1f24",
    "w": "#ffffff",
    "b": { "param": "bodyColor" },
    "s": { "param": "bodyColor", "shade": -0.3 },
    "h": "#3a3a40"
  },
  "frames": {
    "idle-1": [
      "................",
      ".....bbbbbb.....",
      "...bbbbbbbbbb...",
      "..bbbbbbbbbbbb..",
      ".bbbbbbbbbbbbbb.",
      ".bbbwkbbbbwkbbb.",
      ".bbbkkbbbbkkbbb.",
      ".bbbbbbbbbbbbbb.",
      ".bbbbbbkkbbbbbb.",
      ".bbbbbbbbbbbbbb.",
      "..sbbbbbbbbbbs..",
      "...ssbbbbbbss...",
      ".....ssssss.....",
      "................",
      "................",
      "................"
    ]
  },
  "states": {
    "idle": { "frames": ["idle-1", "idle-2"], "fps": 2 },
    "speaking": { "frames": ["talk-1", "talk-2"], "fps": 6 },
    "working": { "frames": ["work-1", "work-2", "work-3"], "fps": 6 }
  },
  "overlays": {
    "accessory": { "headphones": ["acc-headphones"] }
  }
}
```

(Im Beispiel sind nicht alle Frames ausgeschrieben.)

- **Palette:** ein Zeichen pro Farbe. Werte sind eine Farbe (`#RRGGBB`), `transparent` (der Hintergrund des Terminals) oder ein Parameter, optional abgedunkelt bzw. aufgehellt (`shade` von −1 bis 1).
- **Frames:** Zeilen aus Palettenzeichen, alle genau `width` breit und `height` hoch; höchstens 128 × 128 Pixel.
- **Zustände:** Frame-Folge und Bildrate, höchstens 12 Bilder pro Sekunde. Fehlt ein Zustand, gilt der Fallback aus dem Manifest.
- **Overlays:** Frames, die je nach Auswahl- oder Schalter-Parameter über jeden Frame gelegt werden; ihre nicht transparenten Pixel überdecken.
- **Farben:** Das Raster mischt höchstens 1024 Farbpaare gleichzeitig. Kleine Paletten sehen am besten aus.

## 9. Töne, Stimme & Persona

- **`sounds`:** eigene Hinweistöne für `attention`, `done`, `error` und `message`, kurz (unter 1,5 s) und als **WAV**, denn der Windows-Player, den die Mod als Rückfall nutzt, spielt nur WAV. Fehlende Töne nimmt die Mod aus ihrem Standard-Set.
- **`voice`:** vorgeschlagene Windows-Stimmen je Sprache. Ist eine Stimme nicht installiert, nimmt die Mod die Standardstimme der Sprache.
- **`persona`:**
  - `displayName` und `greeting`, jeweils auf Deutsch und Englisch; der Name im Profil hat Vorrang
  - `style`: `concise` (knapp), `friendly` (freundlich), `playful` (verspielt), `formal` (förmlich) oder `butler` (höflich wie ein britischer Butler, „Sehr wohl."). Der Stil prägt die Texte des Erzählers und den Hinweis, den die Mod im Sprachmodus an Prompts anhängt.
  - optional `promptAddon`: höchstens 300 Zeichen je Sprache, die im Sprachmodus zusätzlich an den Hinweis angehängt werden. Bei fremden Vorlagen zeigt die Mod den Text an und aktiviert ihn erst nach deiner Bestätigung (Schutz vor Prompt-Injection).

## 10. Profil

Das Profil liegt in `$.store` und gilt für alle Sitzungen:

```json
{
  "profileVersion": 1,
  "template": { "id": "cda.blob", "version": "^1.0.0" },
  "name": "Jarvis",
  "parameters": { "bodyColor": "#0F766E", "eyes": "happy", "accessory": "headphones", "wobble": 0.3 },
  "voices": { "de": "Microsoft Hedda Desktop", "en": "Microsoft Zira Desktop" },
  "style": "butler",
  "animations": true
}
```

- Fehlt die Vorlage, fällt die Mod auf eine mitgelieferte zurück und sagt das.
- Mit `/avatar aussehen` exportierst du das Profil als JSON-Datei oder importierst eines.

## 11. Anpassen-Ansicht (`/avatar aussehen`)

- Die Ansicht öffnet sich in der Seitenleiste: Auswahl der Vorlage, Bedienelemente aus `parameters`, Name, Stimmen je Sprache mit „Probe hören", Stil und Animationen an/aus.
- **Live-Vorschau:** Änderungen wirken sofort auf den Avatar, in der Desktop-App als SVG, im Terminal als Pixel-Art.
- **Zustände durchspielen:** Knöpfe für jeden Zustand zeigen alle Animationen.
- **Für Vorlagen-Ersteller:** Die Ansicht beobachtet den eigenen Vorlagenordner (alle 2 s, solange sie offen ist) und zeigt Prüffehler mit Datei und Zeile.

## 12. Prüfung & Sicherheit

- **Manifest:** Pflichtfelder, bekannte Typen, gültige Werte, Fallbacks ohne Kreis.
- **SVG:** höchstens ca. 120.000 Zeichen vor dem Einsetzen; abgelehnt werden `<script>`, `<foreignObject>`, Event-Attribute (`on…`), `javascript:` und Verweise auf externe Adressen.
- **Pixel:** Abmessungen der Frames, nur bekannte Palettenzeichen, höchstens 128 × 128 Pixel.
- **Dateien:** nur innerhalb des Vorlagenordners, nur `.json`, `.svg`, `.wav`, `.md`, `.txt` und `LICENSE`, zusammen höchstens 5 MB.
- **Keine Ausführung:** Die Mod liest Vorlagen nur als Daten und importiert nie Dateien daraus.

## 13. Teilen

- **Jetzt:** den Vorlagenordner kopieren oder als ZIP weitergeben und unter `%USERPROFILE%\.claude-desktop-avatar\templates\` entpacken.
- **Später:** Vorlagen-Pakete als eigene kleine Claude-Code-Plugins, die von der Mod abhängen (`dependencies` im Manifest), installierbar wie die Mod selbst.
- **Lizenz:** Die mitgelieferten Vorlagen stehen unter CC BY 4.0. Eigene Vorlagen geben ihre Lizenz im Manifest an.
- **Markenrecht:** keine fremden Logos oder Figuren nachbilden, auch nicht das Claude-Logo oder Jarvis aus den Filmen.

## 14. Versionierung

- `formatVersion` ist eine ganze Zahl. Die Mod unterstützt die aktuelle und die vorherige Version.
- `version` einer Vorlage folgt SemVer. Profile verweisen mit einem Bereich wie `^1.0.0` darauf.

## 15. Offene Punkte

- Läuft CSS-Animation im SVG auch im Mobil-Sandbox-Rahmen flüssig?
- Ist eine automatische Abdunklung (`shade`) mit dem Farblimit des Rasters gut genug?
- 3D und Live2D sind bewusst nicht geplant.
