# Avatar-Vorlagen – Format & Anpassung (Entwurf v0.2)

> Teil des [Projektplans](PLAN.md) · Stand: 5. November 2026 (v0.2: nur 2D, Texte auf Deutsch und Englisch).
> Dieses Dokument beschreibt, wie Avatare aussehen und sich bewegen, wie du sie anpasst und wie du eigene Vorlagen baust und teilst. Das Format wird in Phase 4 als v1 festgeschrieben; bis dahin sind Änderungen möglich.

## 1. Ziele

- **Anpassen ohne Code:** Farben, Teile (Augen, Accessoires), Größe, Stimme, Name und Persönlichkeit änderst du im Avatar-Studio per Klick.
- **Eigene Vorlagen ohne App-Änderung:** Eine Vorlage ist ein Ordner mit Grafiken und einer `avatar.json`. Für SVG und Sprites brauchst du weder Build noch Programmierung.
- **Drei 2D-Stile:** Vektorgrafik (SVG), Pixel-Art und gezeichnete Frames (Sprites), interaktive Animationen (Rive). 3D ist bewusst nicht geplant.
- **Zweisprachig:** Namen, Beschriftungen und Begrüßungen gibt es auf Deutsch und Englisch.
- **Sicher teilbar:** Vorlagen sind reine Daten. Die App führt keinen Code aus Vorlagen aus.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Vorlage** (Template) | Gestaltung, Animationen und anpassbare Parameter; wird als Paket geteilt |
| **Parameter** | ein Regler der Vorlage: Farbe, Auswahl, Schalter oder Zahl |
| **Avatar-Profil** | deine Ausprägung einer Vorlage: gewählte Werte, Name, Stimme, Persona, Verhalten. Mehrere Profile sind möglich (z. B. „Arbeit" und „Privat"). |
| **Paket** (`.avatarpack`) | ZIP-Archiv einer Vorlage, optional mit Profil, zum Teilen |
| **Renderer** | Darstellungsmodul der App für einen Vorlagentyp: `svg`, `sprite` oder `rive` |
| **Zustand** (State) | was der Avatar gerade „tut": `idle`, `thinking`, `speaking` … |
| **Overlay** | Anzeige, die die App unabhängig von der Vorlage darüberlegt: Badge, Fortschrittsring, Mikrofon-Symbol |

## 3. Ordnerstruktur

```text
mein-avatar/
├── avatar.json          # Manifest (Pflicht)
├── preview.png          # Vorschaubild 512×512 (Pflicht für die Galerie)
├── avatar.svg           # Grafik (Renderer svg)
├── style.css            # Farben und Animationen (Renderer svg)
├── sounds/              # optionale Hinweistöne
│   ├── attention.ogg
│   └── done.ogg
├── LICENSE              # Lizenz für Grafiken und Töne
└── README.md            # optional
```

## 4. Manifest `avatar.json`

Beispiel für die mitgelieferte SVG-Vorlage „Blob":

```json
{
  "$schema": "../../schemas/avatar-template.v1.json",
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
  "renderer": "svg",
  "size": { "default": 128, "min": 64, "max": 256 },
  "hitArea": "alpha",
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
        { "id": "happy", "label": { "de": "Fröhlich", "en": "Happy" } },
        { "id": "sleepy", "label": { "de": "Verschlafen", "en": "Sleepy" } }
      ]
    },
    "accessory": {
      "type": "choice",
      "label": { "de": "Accessoire", "en": "Accessory" },
      "default": "none",
      "options": [
        { "id": "none", "label": { "de": "Keins", "en": "None" } },
        { "id": "headphones", "label": { "de": "Kopfhörer", "en": "Headphones" } },
        { "id": "beanie", "label": { "de": "Mütze", "en": "Beanie" } }
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
  "svg": { "file": "avatar.svg", "styles": ["style.css"] },
  "states": {
    "idle": { "loop": true },
    "thinking": { "loop": true, "fallback": "idle" },
    "listening": { "loop": true, "fallback": "idle" },
    "speaking": { "loop": true, "fallback": "idle" },
    "working": { "loop": true, "fallback": "thinking" },
    "attention": { "loop": true, "fallback": "idle" },
    "success": { "once": true, "duration": 1600, "fallback": "idle" },
    "error": { "once": true, "duration": 1200, "fallback": "idle" },
    "sleeping": { "loop": true, "fallback": "idle" }
  },
  "mouth": { "mode": "steps", "steps": [0.15, 0.55] },
  "sounds": {
    "attention": "sounds/attention.ogg",
    "done": "sounds/done.ogg"
  },
  "voice": {
    "rate": 1.05,
    "pitch": 1.15,
    "piper": { "de": "de_DE-thorsten-medium", "en": "en_US-lessac-medium" }
  },
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
| `id` | ja | eindeutige ID in Kleinbuchstaben, z. B. `max.robo` (Punkt und Bindestrich erlaubt) |
| `version` | ja | Version der Vorlage nach SemVer |
| `name`, `description` | `name` ja | mehrsprachig: `{ "de": "…", "en": "…" }` |
| `author`, `license` | ja | Lizenz als SPDX-Kennung, z. B. `CC-BY-4.0` oder `CC0-1.0` |
| `renderer` | ja | `svg`, `sprite` oder `rive` |
| `size` | ja | Standard-, Mindest- und Maximalgröße in logischen Pixeln |
| `hitArea` | nein | klickbare Fläche: `alpha` (aus der Transparenz berechnet, Standard), `{ "circle": [cx, cy, r] }` oder `{ "polygon": [[x, y], …] }`, jeweils relativ (0–1) |
| `parameters` | nein | anpassbare Regler (Abschnitt 5) |
| `states` | ja (mindestens `idle`) | unterstützte Zustände und ihr Verhalten (Abschnitt 6) |
| `mouth` | nein | Lippen-Sync (Abschnitt 7) |
| `svg`, `sprite`, `rive` | passend zum Renderer | renderer-spezifische Angaben (Abschnitt 8) |
| `overlay` | nein | Farben und Ankerpunkt der App-Overlays (Badge, Fortschrittsring), z. B. `{ "anchor": [0.85, 0.15], "color": "#E11D48" }` |
| `sounds` | nein | eigene Hinweistöne je Ereignis (Abschnitt 9) |
| `voice`, `persona` | nein | Vorschläge für Stimme und Persönlichkeit; das Profil kann sie überschreiben (Abschnitt 9) |

## 5. Parameter

| Typ | Element im Studio | Beispiel | Wirkung |
|---|---|---|---|
| `color` | Farbwähler mit optionaler Palette | Körperfarbe | CSS-Variable `--p-<id>`, Tönung von Sprite-Ebenen, Rive-Eingang |
| `choice` | Auswahlkacheln mit Vorschau | Augenform, Accessoire | blendet passende SVG-Gruppen oder Ebenen ein und aus |
| `toggle` | Schalter | Leuchten an/aus | Attribut `data-p-<id>="true"` |
| `range` | Schieberegler (`min`, `max`, `step`) | Wabbeln 0–1 | CSS-Variable `--p-<id>`, Rive-Zahleneingang |

- Jeder Parameter hat `label` und `default`. `choice` hat zusätzlich `options` mit ASCII-`id` und `label`.
- **Texte:** Jede Beschriftung ist ein Objekt mit Sprachcodes; empfohlen sind `de` und `en`. Fehlt die Sprache der Oberfläche, nimmt die App `en`, dann `de`, dann die erste vorhandene. Der Validator warnt, wenn eine der beiden Sprachen fehlt.
- Allgemeine Einstellungen gibt die App selbst vor; Vorlagen müssen sie nicht definieren: Größe, Deckkraft, Spiegeln (Blick nach links oder rechts), Animationsstärke, reduzierte Animationen.

## 6. Zustände

| Zustand | Bedeutung | Typischer Auslöser | Standard-Fallback |
|---|---|---|---|
| `idle` | Ruhe, gelegentliches Blinzeln | keiner der anderen Zustände | – (Pflicht) |
| `hover` | Mauszeiger über dem Avatar | Zeiger | `idle` |
| `dragging` | wird verschoben | Ziehen | `idle` |
| `listening` | hört zu | Sprechtaste aktiv | `idle` |
| `thinking` | wartet auf die Antwort | Anfrage gesendet, noch kein Text | `idle` |
| `speaking` | antwortet bzw. spricht | Text-Streaming, Sprachausgabe | `idle` |
| `working` | Claude arbeitet in einer Sitzung | Werkzeug-Schritte laufen | `thinking` |
| `attention` | braucht dich | Freigabe oder Eingabe nötig | `idle` (+ Badge „!") |
| `success` | fertig (einmalig) | Sitzung hat ihre Aufgabe beendet | `idle` |
| `error` | Fehler (einmalig) | Abbruch, Fehler | `idle` |
| `sleeping` | schläft | Inaktivität, Nicht stören | `idle` |

- **Eigenschaften je Zustand:** `loop` (Endlosanimation), `once` + `duration` in ms (einmalig, danach zurück), `fallback` (Ersatz, wenn die Vorlage den Zustand nicht gestaltet), optional `minDuration` gegen Flackern.
- **Priorität**, wenn mehrere Zustände zutreffen: `dragging` > `listening` > `speaking` > `attention` > `thinking` > `working` > `success`/`error` > `hover` > `sleeping` > `idle`.
- **Overlays:** Die Anzahl wartender Sitzungen, den Fortschrittsring und das Mikrofon-Symbol zeichnet die App selbst. Vorlagen können über `overlay` Farben und Ankerpunkt anpassen, müssen es aber nicht.

## 7. Mund & Lippen-Sync

- Die App liefert etwa 30-mal pro Sekunde eine Mundöffnung `mouthOpen` zwischen 0 und 1, berechnet aus der Lautstärke der Sprachausgabe. Das funktioniert mit jeder Stimme und in beiden Sprachen.
- `"mode": "continuous"`: Die Vorlage nutzt die CSS-Variable `--mouth-open` direkt, z. B. für eine stufenlose Skalierung.
- `"mode": "steps"`: Die App bildet den Wert über die Schwellen in `steps` auf `closed`, `half` und `open` ab und setzt `data-mouth` entsprechend.
- Später: Viseme (z. B. `A`, `E`, `O`, `M`, `F`), wenn ein Sprachanbieter Lautzeitpunkte liefert.

## 8. Renderer

### 8.1 `svg` – Standard, ideal zum Einstieg

- Eine `avatar.svg` mit benannten Gruppen, entworfen z. B. in Figma oder Inkscape.
- **Auswahl-Parameter:** Gruppen mit `data-param` und `data-value` blendet die App passend zum gewählten Wert ein und aus. Gruppen mit `data-mouth` zeigt sie passend zur Mundstufe.
- **Farben und Animationen** stehen in `style.css`. Wichtig: CSS-Variablen wie `var(--p-bodyColor)` funktionieren in CSS-Regeln, aber nicht in SVG-Attributen wie `fill="…"`.
- Die App rendert die Grafik in einem Wurzelelement `.avatar` (in einem Shadow DOM) und setzt dort:

| Attribut / Variable | Werte | Zweck |
|---|---|---|
| `data-state` | `idle`, `thinking`, … | aktueller Zustand |
| `data-blink` | `true` / `false` | Blinzeln, zufällig alle 2–6 s |
| `data-mouth` | `closed`, `half`, `open` | Mundstufe (Modus `steps`) |
| `data-facing` | `left`, `right` | Blickrichtung je nach Bildschirmseite |
| `data-p-<id>` | gewählter Wert | Auswahl- und Schalter-Parameter |
| `--p-<id>` | Farbe oder Zahl | Farb- und Zahlen-Parameter |
| `--mouth-open` | 0–1 | kontinuierliche Mundöffnung |
| `--look-x`, `--look-y` | −1 bis 1 | Blickrichtung zum Mauszeiger |
| `--intensity` | 0–1 | Animationsstärke; bei reduzierten Animationen 0 |

Ausschnitt `avatar.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <g class="body-group">
    <path class="body" d="M128 28c58 0 96 46 96 104s-38 96-96 96-96-38-96-96 38-104 96-104z"/>
  </g>
  <g class="eyes" data-param="eyes" data-value="round">
    <circle class="eye" cx="98" cy="122" r="13"/>
    <circle class="eye" cx="158" cy="122" r="13"/>
  </g>
  <g class="eyes" data-param="eyes" data-value="happy">
    <path class="eye-line" d="M84 126q14-16 28 0M144 126q14-16 28 0"/>
  </g>
  <g class="mouth" data-mouth="closed"><path class="lip" d="M110 168q18 10 36 0"/></g>
  <g class="mouth" data-mouth="half"><ellipse class="mouth-fill" cx="128" cy="170" rx="14" ry="7"/></g>
  <g class="mouth" data-mouth="open"><ellipse class="mouth-fill" cx="128" cy="172" rx="16" ry="13"/></g>
  <g data-param="accessory" data-value="headphones"><!-- Kopfhörer --></g>
</svg>
```

Ausschnitt `style.css`:

```css
.body { fill: var(--p-bodyColor); }
.eye, .mouth-fill { fill: #1f1f24; }
.eye-line, .lip { fill: none; stroke: #1f1f24; stroke-width: 6; stroke-linecap: round; }

/* Augen schließen beim Blinzeln */
.avatar[data-blink="true"] .eye { transform: scaleY(0.1); transform-box: fill-box; transform-origin: center; }

/* Zustände */
.avatar[data-state="idle"] .body-group {
  animation: float 4s ease-in-out infinite;
}
.avatar[data-state="thinking"] .body-group,
.avatar[data-state="working"] .body-group {
  animation: pulse 1.2s ease-in-out infinite;
}
.avatar[data-state="success"] .body-group {
  animation: hop 0.4s ease-out 4;
}

@keyframes float {
  50% { transform: translateY(calc(-6px * var(--intensity) * (0.5 + var(--p-wobble)))); }
}
@keyframes pulse {
  50% { transform: scale(calc(1 + 0.04 * var(--intensity))); }
}
@keyframes hop {
  50% { transform: translateY(calc(-14px * var(--intensity))); }
}

@media (prefers-reduced-motion: reduce) {
  .avatar .body-group { animation: none !important; }
}
```

### 8.2 `sprite` – Pixel-Art und gezeichnete Frames

```json
{
  "renderer": "sprite",
  "sprite": {
    "frameWidth": 96,
    "frameHeight": 96,
    "pixelArt": true,
    "tint": { "parameter": "bodyColor", "maskSuffix": ".mask.png" },
    "overlays": { "accessory": { "hat": "sprites/{state}.hat.png" } }
  },
  "states": {
    "idle": { "sheet": "sprites/idle.png", "frames": 8, "fps": 6, "loop": true },
    "working": { "sheet": "sprites/working.png", "frames": 12, "fps": 12, "loop": true, "fallback": "idle" },
    "speaking": {
      "loop": true,
      "mouthSheets": {
        "closed": "sprites/talk-closed.png",
        "half": "sprites/talk-half.png",
        "open": "sprites/talk-open.png"
      },
      "frames": 4,
      "fps": 8
    },
    "success": { "sheet": "sprites/success.png", "frames": 10, "fps": 12, "once": true, "fallback": "idle" }
  }
}
```

- Pro Zustand ein Spritesheet (Frames nebeneinander) oder eine animierte WebP/APNG-Datei.
- `pixelArt: true` skaliert ohne Weichzeichnen (Nearest Neighbor).
- **Farben:** Eine Graustufen-Maske je Sheet (`idle.mask.png`) wird mit der Parameterfarbe eingefärbt.
- **Auswahl-Parameter:** zusätzliche Overlay-Sheets mit identischem Frame-Raster; `{state}` wird durch den Zustand ersetzt.

### 8.3 `rive` – interaktive Animationen

```json
{
  "renderer": "rive",
  "rive": {
    "file": "avatar.riv",
    "artboard": "Avatar",
    "stateMachine": "Main",
    "inputs": {
      "state": {
        "type": "number",
        "map": { "idle": 0, "thinking": 1, "speaking": 2, "working": 3, "attention": 4, "success": 5, "error": 6, "sleeping": 7, "listening": 8 }
      },
      "mouthOpen": { "type": "number", "source": "mouth", "scale": 100 },
      "lookX": { "type": "number", "source": "lookX", "scale": 100 },
      "accessory": { "type": "number", "source": "param:accessory", "map": { "none": 0, "headphones": 1, "beanie": 2 } }
    }
  }
}
```

- Die App steuert die State Machine der `.riv`-Datei über Eingänge.
- Farb-Parameter brauchen Data Binding in der Rive-Datei; das wird in Phase 4 geprüft.
- Die Rive-Runtime ist Open Source, für den Rive-Editor gelten dessen eigene Lizenz- und Preisbedingungen.

## 9. Töne, Stimme & Persona

- **`sounds`:** eigene Hinweistöne für `attention`, `done`, `error`, `listen-start`, `listen-stop` und `message`. Kurz (unter 1,5 s), als OGG, MP3 oder WAV. Fehlende Töne ersetzt die App aus ihrem Standard-Set.
- **`voice`:** nur ein Vorschlag, denn verfügbare Stimmen unterscheiden sich je System. Mögliche Angaben sind `rate`, `pitch` und bevorzugte Stimmen je Anbieter und Sprache, z. B. `"piper": { "de": "…", "en": "…" }`. Die konkrete Stimme wählst du im Profil.
- **`persona`:**
  - `displayName` und `greeting`, jeweils auf Deutsch und Englisch
  - `style`: `concise` (knapp), `friendly` (freundlich), `playful` (verspielt) oder `formal` (förmlich). Der Stil prägt den Chat-Prompt und die Formulierungen des Erzählers.
  - optional `systemPromptAddon`: höchstens 500 Zeichen je Sprache. Bei importierten Vorlagen wird der Text angezeigt und erst nach deiner Bestätigung aktiv.

## 10. Avatar-Profil

Ein Profil speichert deine Ausprägung einer Vorlage im App-Datenordner:

```json
{
  "profileVersion": 1,
  "id": "arbeit",
  "template": { "id": "cda.blob", "version": "^1.0.0" },
  "name": "Pixel",
  "parameters": { "bodyColor": "#0F766E", "eyes": "happy", "accessory": "headphones", "wobble": 0.3 },
  "size": 144,
  "voice": {
    "provider": "piper",
    "voices": { "de": "de_DE-thorsten-medium", "en": "en_US-lessac-medium" },
    "rate": 0.95
  },
  "persona": { "style": "concise" },
  "behavior": { "eyesFollowCursor": true, "sleepAfterMinutes": 15, "snapToEdges": true }
}
```

- Profile verweisen per ID und Versionsbereich auf ihre Vorlage. Fehlt die Vorlage, bietet die App den Import an.
- Pro Sprache lässt sich eine eigene Stimme hinterlegen; welche gilt, hängt von der Sprache der Antwort ab.
- Exportierst du ein Profil mit Vorlage, entsteht ein `.avatarpack`. Ein Profil allein ist eine kleine JSON-Datei, praktisch für öffentlich verfügbare Vorlagen.

## 11. Avatar-Studio

- **Galerie:** mitgelieferte und installierte Vorlagen mit Suche und animierter Vorschau; „Zustände durchspielen" zeigt alle Animationen nacheinander.
- **Anpassen:** Bedienelemente entstehen automatisch aus `parameters`. Dazu kommen allgemeine Einstellungen, Stimmauswahl je Sprache mit „Probe hören" und die Persona.
- **Live-Vorschau:** Änderungen wirken sofort auf den echten Avatar am Desktop.
- **Verwalten:** Profile anlegen und wechseln, Import und Export als `.avatarpack`, „Als neue Vorlage duplizieren" (kopiert die Vorlage zum Bearbeiten in deinen Vorlagenordner).
- **Entwicklermodus:** Der Vorlagenordner wird beobachtet (Hot Reload). Validierungsfehler erscheinen direkt im Studio, ein Zustands-Simulator bietet Knöpfe für jeden Zustand und einen Regler für die Mundöffnung. Ein Sprachumschalter zeigt die Texte auf Deutsch und Englisch.

## 12. Sicherheit & Validierung

- **Schema:** Jede `avatar.json` wird gegen das JSON Schema geprüft, das aus den Zod-Typen erzeugt wird. Ungültige Vorlagen werden mit verständlichen Fehlermeldungen abgelehnt.
- **Pakete:**
  - Größe: bis 25 MB, höchstens 500 Dateien.
  - Nur erlaubte Dateitypen: `.json`, `.svg`, `.css`, `.png`, `.webp`, `.apng`, `.gif`, `.ogg`, `.mp3`, `.wav`, `.riv`, `.md`, `.txt` sowie `LICENSE`.
  - Keine absoluten Pfade, keine `..`-Segmente und keine symbolischen Links. Entpackt wird nur in den Vorlagenordner der App.
- **SVG:** Bereinigung mit DOMPurify (SVG-Profil). Entfernt werden `<script>`, `<foreignObject>`, Event-Attribute (`on…`), `javascript:`-URLs und externe Verweise. Erlaubt sind nur interne Referenzen (`#id`) und Dateien aus dem Paket.
- **CSS:** kein `@import` und kein externes `url()`. Relative Verweise werden auf lokale Blob-URLs umgeschrieben, die Styles sind per Shadow DOM isoliert.
- **Laufzeit:** Der Renderer läuft in einem Sandbox-Prozess ohne Node-Zugriff. Seine Content Security Policy erlaubt keinen Netzwerkzugriff (`connect-src 'none'`).
- **Persona-Texte:** `systemPromptAddon` aus fremden Vorlagen wird angezeigt und ist erst nach Bestätigung aktiv (Schutz vor Prompt-Injection).
- **Galerie:** Pakete werden vorab in der CI geprüft und beim Download über SHA-256-Prüfsummen verifiziert.

## 13. Werkzeuge, Teilen & Galerie

- **Validator-CLI** (Paket `avatar-format`):

  ```bash
  npx avatar-pack validate ./mein-avatar
  ```

  ```bash
  npx avatar-pack pack ./mein-avatar
  ```

- **Teilen:** ab Phase 4 per `.avatarpack`-Datei. Später kommt eine Galerie als GitHub-Repository mit `index.json`: Einreichungen laufen über Pull Requests, die CI validiert sie und erzeugt Vorschaubilder, und die App zeigt die Galerie mit Installieren-Knopf.
- **Lizenz:** Die mitgelieferten Vorlagen stehen unter CC BY 4.0. Eigene Vorlagen geben ihre Lizenz im Manifest an.
- **Markenrecht:** Vorlagen dürfen keine fremden Logos oder Marken nachbilden, auch nicht das Claude-Logo.

## 14. Versionierung

- `formatVersion` ist eine ganze Zahl. Die App unterstützt die aktuelle und die vorherige Version und migriert ältere Vorlagen automatisch.
- `version` einer Vorlage folgt SemVer. Profile verweisen mit einem Bereich wie `^1.0.0` darauf.

## 15. Offene Punkte

- Welche Sprachanbieter liefern Viseme bzw. Lautzeitpunkte (Azure ja, weitere prüfen)?
- Farb-Parameter in Rive über Data Binding
- 3D (z. B. VRM) und Live2D sind bewusst nicht geplant.
