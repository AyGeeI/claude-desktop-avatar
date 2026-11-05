# Mod-Konzept – Ereignisse, Sprache, Darstellung

> Teil des [Projektplans](PLAN.md) · Stand: 5. November 2026 (v0.3: Umsetzung als Mod für Claude Code).
> Die Angaben zur Mod-Schnittstelle stammen aus den Typen und der Referenz, die Claude Code für Mods mitliefert (geprüft mit Version 2.1.318), die Angaben zu `/voice` aus der offiziellen Doku. Offene Punkte prüft Phase 0.

## 1. Bausteine

| Baustein | Datei | Aufgabe | Wichtigste Schnittstellen |
|---|---|---|---|
| Einstieg | `hooks/register.tsx` | registriert alle Hooks und verbindet die Bausteine | `on(…)`, `register(on, options)` |
| Ereignis-Adapter | `src/events.ts` | übersetzt Sitzungs-Ereignisse in eigene Avatar-Ereignisse | `prompt.submit`, `tool.call`, `turn.start`, `turn.step`, `turn.complete` |
| Zustand | `src/state.ts`, `types/index.d.ts` | Avatar-Zustand, Plan, letzte Schritte; Einstellungen und Profil | `atom`, `read`, `update`, `$.store` |
| Erzähler | `src/narrator.ts` | Texte auf Deutsch und Englisch, Prioritäten, Bündelung, Drosselung | – |
| Sprache | `src/voice.ts` | Befehle an den Avatar, Vorlesen, Warteschlange, Windows-Rückfall | `$.audio.speak`, `$.process.spawn`, `$.prompt.submit`, `$.turn.abort`, `$.model.*` |
| Sitzungen | `src/sessions.ts` | gemeinsamer Status-Ordner, Sprecher-Wahl | `$.fs`, `$.clock` |
| Vorlagen | `src/templates.ts` | Vorlagen laden, prüfen und mit Parametern füllen | `$.fs` |
| Darstellung | `src/render/` | Seitenleiste, Band, Spinner, Hintergrund; SVG- und Pixel-Avatar | `ui.render`, `$.ui.*`, `Svg`, `Raster`, `$.ui.blit` |

Alle Bausteine sind normale TypeScript-Dateien des Plugins und werden statisch importiert. Laut Referenz lädt ein Modul mit dynamischem `import()` nicht. Zur Laufzeit gibt es weder DOM noch Node: Alles außerhalb der Mod erreicht sie über `$`.

## 2. Lebenszyklus

1. **`session.start`:** Optionen und Profil laden (`options`, `$.store`), Befehl `/avatar` registrieren, Status-Datei anlegen, Zeitgeber für Herzschlag und Leerlauf-Animation starten, Seitenleiste öffnen (falls eingestellt) und optional begrüßen („Guten Morgen. Zwei Sitzungen laufen, das API-Projekt wartet auf dich.").
2. **Während der Sitzung:** Die Hooks werten Ereignisse aus, aktualisieren den Zustand und zeichnen neu, sobald sich gelesene Werte ändern.
3. **Ende:** Der Herzschlag der Status-Datei endet; andere Instanzen räumen sie nach 30 s auf.
4. **Beim Entwickeln:** Ein Neuladen führt `register` und `session.start` erneut aus. `$.state` und `$.store` bleiben erhalten, die Variablen des Moduls beginnen neu.

**Grundregel:** Jeder Hook reicht an `next(e)` weiter und fängt eigene Fehler ab. Die Mod beobachtet und ergänzt; sie blockiert keine Werkzeuge und entscheidet keine Freigaben.

## 3. Ereignisse → Avatar

| Ereignis der Sitzung | Was die Mod liest | Eigenes Ereignis | Wirkung |
|---|---|---|---|
| `prompt.submit` | `text`, `command`, `isMeta` | `prompt.submitted` oder ein Befehl an den Avatar | Zustand `thinking`. Befehle erledigt die Mod selbst und verwirft den Prompt (`{ drop }`); im Sprachmodus hängt sie einen Hinweis als `context` an (Abschnitt 5) |
| `turn.start` | `turnId`, `agentId` | `turn.started` | merkt sich die Haupt-Runde für „Stopp" |
| `turn.step` (Stream) | Text-, Werkzeug- und Stop-Stücke | `message.delta`, `step.planned` | zeigt früh, was Claude schreibt und welches Werkzeug startet |
| `tool.call` (vor und nach `next`) | Werkzeug, gekürzte Eingaben, Ergebnis (`isError`) | `step.started`, `step.finished`, `step.failed`, `plan.updated` | Statuszeile, Seitenleiste, Fortschritt |
| `tool.check` bzw. Benachrichtigung (in Phase 0 klären) | Frage nach einer Freigabe | `attention.permission` | Zustand `attention`, Ton, Ansage, Systembenachrichtigung |
| `turn.complete` | Ergebnis, Nutzung | `turn.finished`, `turn.failed` | Zustand `success` oder `error`, Ansage |
| Subagenten (`agentId`, `$.agent.list()`) | Typ, Beschreibung | `subagent.started`, `subagent.finished` | „Hilfsagent recherchiert …" |

**Gekürzte Ziele:** Bei Dateiwerkzeugen nur der Dateiname ohne Pfad; bei Shell-Befehlen die ersten ca. 60 Zeichen und eine erkannte Kategorie (Tests, Build, Git, Installation); bei Suchen das Muster; bei Web-Zugriffen nur die Domain.

**Aufgabenliste:** Neuere Claude-Code-Versionen führen ihren Plan über `TaskCreate` und `TaskUpdate` (u. a. `subject`, `activeForm`, `status`), ältere über `TodoWrite`. Die Mod liest beide über `tool.call`. „Schritt N von M" ergibt sich aus erledigten und offenen Aufgaben; angezeigt wird die `activeForm` der laufenden Aufgabe.

**Eigenes Ereignismodell** (bewusst klein):

```ts
type Severity = 'debug' | 'info' | 'milestone' | 'urgent';

type ToolCategory =
  | 'read' | 'write' | 'edit' | 'shell' | 'search'
  | 'web' | 'agent' | 'plan' | 'mcp' | 'other';

interface AvatarEvent {
  ts: number;                  // Unix-Zeit in ms
  kind:
    | 'prompt.submitted' | 'turn.started' | 'message.delta'
    | 'step.started' | 'step.finished' | 'step.failed' | 'plan.updated'
    | 'subagent.started' | 'subagent.finished'
    | 'attention.permission' | 'turn.finished' | 'turn.failed';
  tool?: { name: string; category: ToolCategory; target?: string }; // bereits gekürzt
  plan?: { total: number; done: number; current?: string };
  text?: string;               // gekürzter Freitext
  severity: Severity;
}
```

## 4. Erzähler

Der Erzähler arbeitet lokal mit Textvorlagen auf Deutsch und Englisch, ohne KI. Die Tabelle zeigt die deutschen Texte.

| Werkzeug / Ereignis | Seitenleiste & Statuszeile | Gesprochen (Stufe „Normal") |
|---|---|---|
| `Read` | Liest `app.ts` | – |
| `Write` / `Edit` | Erstellt `checkout.test.ts` / Bearbeitet `cart.ts` | – |
| `Bash`, `PowerShell` (Tests erkannt) | Führt die Tests aus | – |
| `Bash`, `PowerShell` (allgemein) | Führt aus: `docker compose up` | – |
| `Grep`, `Glob` | Durchsucht das Projekt nach „PaymentError" | – |
| `WebSearch`, `WebFetch` | Recherchiert im Web · Liest example.com | – |
| Subagent (`Agent`) | Hilfsagent: Tests analysieren | – |
| Aufgabenliste | Schritt 3/7 · Tests ausführen | – (Stufe „Gesprächig": „Nächster Schritt: Tests ausführen.") |
| MCP-Werkzeug, z. B. `mcp__github__create_pr` | Nutzt github: create_pr | – |
| Freigabe nötig | Freigabe nötig: Bash `rm -rf dist` | „Ich brauche deine Freigabe." |
| Fertig | Fertig · 3 Dateien geändert | „Fertig." bzw. der vorlesbare Einstieg der Antwort (Abschnitt 5.3) |
| Fehler / Abbruch | Abgebrochen: Rate-Limit | „Da ist etwas schiefgegangen." |

**Ausführlichkeitsstufen:**

| Stufe | Seitenleiste & Statuszeile | Sprache | Töne |
|---|---|---|---|
| Still | nur Dringendes | nichts | nur Dringendes |
| Normal (Standard) | aktueller Schritt, Meilensteine, Dringendes | Dringendes und „fertig" | Dringendes, fertig, Fehler |
| Gesprächig | jeder Schritt (gebündelt) | zusätzlich Planschritte | alle |

Dazu kommen Ruhezeiten (z. B. 20–8 Uhr ohne Sprache) und die Befehle „leiser" und „lauter".

**Regeln gegen Ansage-Flut:**

- **Bündeln:** Gleichartige Schritte innerhalb von 3 s werden zusammengefasst („Liest 4 Dateien").
- **Drosseln:** höchstens eine nicht dringende Ansage alle 20 s; Dringendes sofort, insgesamt höchstens eine Ansage alle 5 s.
- **Verwerfen:** Ansagen, die beim Abspielen älter als 10 s sind, entfallen.
- **Sprechbar formulieren:** Pfade, Befehle, Code und Tabellen werden nie vorgelesen. Projektnamen werden lesbar gemacht (`webshop-api` → „Webshop API").

## 5. Sprache

### 5.1 Eingabe über `/voice`

Claude Code hat eine eingebaute Spracheingabe. Die Mod nutzt sie, statt selbst auf das Mikrofon zuzugreifen (das kann eine Mod nicht).

- **Einrichtung (einmalig):**
  - `/voice tap`: antippen, sprechen, erneut antippen. Ab drei Wörtern wird der Prompt automatisch gesendet; die Aufnahme endet nach 15 s Stille oder 2 Minuten.
  - oder `/voice hold` (Taste halten) mit `"voice": { "autoSubmit": true }`, damit beim Loslassen gesendet wird.
  - Taste: Aktion `voice:pushToTalk` in `~/.claude/keybindings.json` (Standard: Leertaste).
  - Sprache: die Einstellung `language`, z. B. `"german"`; sie steuert auch die Antwortsprache von Claude. Deutsch wird unterstützt.
  - Mikrofon unter Windows freigeben: Einstellungen → Datenschutz und Sicherheit → Mikrofon.
- **Voraussetzungen laut Doku:** Anmeldung mit dem Claude-Konto; mit `ANTHROPIC_API_KEY` oder anderen Anbietern ist `/voice` nicht verfügbar. Nicht in SSH- oder Cloud-Sitzungen. Die Umwandlung verbraucht keine Tokens und zählt nicht zu den Nutzungslimits.
- **Datenschutz:** Das Audio wird zu Anthropic übertragen und dort in Text umgewandelt, nicht lokal.
- **Offen:** Ob `/voice` auch im Code-Tab der Desktop-App verfügbar ist, nennt die Doku nicht; Phase 0 prüft das.
- **Hilfe in der Mod:** `/avatar einrichten` zeigt diese Schritte als Checkliste und prüft, was sich lesen lässt (z. B. `voice` und `language` über `$.settings`).

### 5.2 Befehle an den Avatar

- **Erkennung** in `prompt.submit`: Beginnt der Text mit dem Namen des Assistenten („Jarvis, …", „Hey Jarvis …"), prüft die Mod eine kleine Liste von Befehlen mit Schlüsselwörtern auf Deutsch und Englisch. Unklare Fälle kann `$.model.classify` entscheiden.
- **Erkannte Befehle** erledigt die Mod selbst und verwirft den Prompt (`{ drop }`). Alles andere geht unverändert an Claude.

| Befehl (Beispiele) | Wirkung |
|---|---|
| „Status", „Wie ist der Stand?" | Überblick über alle Sitzungen aus dem Status-Ordner, gesprochen und in der Seitenleiste |
| „Stopp", „Abbrechen" | `$.turn.abort` für die laufende Runde |
| „Leiser", „Lauter", „Still" | Ausführlichkeitsstufe ändern |
| „Was machst du gerade?" | `$.model.fork` mit niedrigem Effort: ein Satz zum aktuellen Stand der Sitzung |
| „Zusammenfassung" | die letzte Antwort in zwei Sätzen (`$.model.complete` mit `haiku`) |
| „Wiederholen" | letzte Ansage noch einmal |

Dieselben Befehle gibt es getippt als `/avatar status`, `/avatar stopp` usw.

**Sprachmodus:** Ob ein Prompt diktiert oder getippt wurde, kann die Mod nicht unterscheiden; das Diktat erscheint für sie wie jede andere Änderung durch Claude Code. Deshalb gibt es einen Schalter `/avatar sprache an`. Ist er an, bekommt jeder Prompt den Hinweis als `context`: „Beginne mit ein bis zwei kurzen, gut vorlesbaren Sätzen; Details danach." Den Anfang der Antwort liest die Mod dann vor.

### 5.3 Ausgabe

- **Sprachausgabe:** `$.audio.speak(text, { voice })` mit einer Stimme je Sprache. Die genauen Namen liefert Windows, z. B. „Microsoft Hedda Desktop" für Deutsch und „Microsoft Zira Desktop" für Englisch, sofern die Sprachpakete installiert sind.
- **Rückfall:** Funktioniert `$.audio.speak` unter Windows nicht wie gebraucht, startet die Mod mit `$.process.spawn` die Windows-PowerShell mit einem festen Skript für `System.Speech`. Der Text geht über stdin, die Stimme als Argument; Beenden der Schleife beendet den Prozess.
- **Warteschlange:** Dringendes zuerst, Veraltetes verwerfen. Startet ein neuer Prompt, verstummt der Avatar (Barge-in).
- **Was gesprochen wird:** die Ansagen des Erzählers und im Sprachmodus der vorlesbare Einstieg der Antwort (höchstens ca. 300 Zeichen). Fehlt ein solcher Einstieg, fasst `$.model.complete` die Antwort optional in einem Satz zusammen.
- **Töne:** WAV-Dateien unter `sounds/`, abgespielt über `$.audio.play`, wo das funktioniert, sonst über den Windows-Player per PowerShell. Laut Doku spielt `$.audio.play` in einem Windows-Terminal nichts ab.
- **Sprech-Animation:** Der Zustand `speaking` gilt, solange die Ansage läuft. Ein Lippen-Sync nach Lautstärke ist nicht möglich, weil die Mod das Audiosignal nicht sieht.

## 6. Darstellung je Oberfläche

| Oberfläche | Avatar | Weitere Anzeigen | Hinweise |
|---|---|---|---|
| Desktop-App (Code-Tab) | `Svg` mit `isInteractive`: CSS- und SMIL-Animation in einem Sandbox-Rahmen ohne Skripte | Band, Spinner, Statuszeile, Hintergrund (`$.ui.backdrop`) | schönste Darstellung |
| Terminal (Windows Terminal) | `Raster`: Pixel-Art aus Halbblock-Zeichen (`▀`) in True Color, bildweise neu gezeichnet über `$.ui.blit` | Band, Spinner, Statuszeile | `Image` funktioniert nur in kitty, Ghostty und iTerm2, nicht in Windows Terminal |
| VS Code | `Svg` als Bild: Animation läuft, Hover nicht | Band, Spinner, Statuszeile | eingeschränkt |
| Mobil | `Svg` in einer Web-Ansicht | Band, Statuszeile | kein Ziel, läuft aber mit |

**Seitenleiste** (Entwurf):

```text
┌ Avatar ────────────────────────────┐
│          (animierter Avatar)       │
│   Jarvis · arbeitet                │
│   webshop · Schritt 3/7            │
│   ▸ Führt die Tests aus            │
│   ──────────────────────────────   │
│   Andere Sitzungen                 │
│   ● api       wartet auf dich      │
│   ○ docs      fertig               │
│   [Leise]  [Status]  [Aussehen]    │
└────────────────────────────────────┘
```

- **Platz im Terminal:** Ungefragt öffnet sich die Seitenleiste ab 144 Spalten, nach `/avatar` in jeder Breite. Im Vollbild-Modus dockt sie neben dem Chat an (höchstens 45 % der Breite, mindestens 24 Spalten), sonst erscheint sie über der Eingabe. Breite und Höhe lassen sich mit Maus oder Tastatur anpassen.
- **Pixel-Avatar:** Jede Zeichenzelle zeigt zwei übereinanderliegende Pixel (Vordergrund oben, Hintergrund unten). Ein Avatar mit 32 × 32 Pixeln braucht also 32 Spalten und 16 Zeilen. Neu gezeichnet wird nur, solange sich etwas bewegt, höchstens ca. 12-mal pro Sekunde.
- **SVG-Avatar:** Die Mod setzt das SVG aus der Vorlage zusammen. Parameter werden zu CSS-Variablen in einem eingebetteten `<style>`, der Zustand zur Klasse am Wurzelelement. Höchstens 131.072 Zeichen; ein Alternativtext ist Pflicht (z. B. „Jarvis, arbeitet").
- **Spinner:** Die Zeile „Denkt nach …" zeigt den Avatar-Zustand und den aktuellen Schritt statt des Standardworts.

## 7. Mehrere Sitzungen

Jede offene Claude-Code-Sitzung hat ihre eigene Instanz der Mod. Sie verständigen sich über einen gemeinsamen Ordner, ganz ohne Server.

- **Ordner:** `%USERPROFILE%\.claude-desktop-avatar\sessions\`
- **Schreiben:** Jede Instanz schreibt bei Änderungen (höchstens alle 500 ms) und als Herzschlag alle 5 s ihre Datei `<session_id>.json`:

  ```json
  {
    "sessionId": "3f6c…",
    "project": "webshop",
    "state": "working",
    "step": "Führt die Tests aus",
    "plan": { "done": 3, "total": 7 },
    "needsYou": false,
    "updatedAt": 1762300000000
  }
  ```

- **Lesen:** alle 2 s, aber nur, solange die Seitenleiste offen ist, sowie bei „Status".
- **Aufräumen:** Dateien ohne Herzschlag seit 30 s gelten als beendet und werden gelöscht.
- **Sprecher-Wahl:** Damit nichts doppelt angesagt wird, spricht nur die Instanz, die `speaker.json` hält (Sitzungs-ID und Herzschlag); sie sagt die Meldungen aller Sitzungen an. Die Sitzung, in die du zuletzt getippt oder gesprochen hast, übernimmt die Rolle; ist der Herzschlag älter als 10 s, übernimmt die nächste.
- **Gleichzeitigkeit:** Jede Instanz schreibt nur ihre eigene Datei. Bei `speaker.json` liest die Mod nach dem Schreiben zurück, um gleichzeitige Übernahmen aufzulösen.

## 8. Befehle & Einstellungen

| Befehl | Wirkung |
|---|---|
| `/avatar` | Seitenleiste öffnen oder schließen |
| `/avatar status` | Überblick über alle Sitzungen, auch gesprochen |
| `/avatar leise` · `/avatar normal` · `/avatar gesprächig` | Ausführlichkeit |
| `/avatar sprache an` · `/avatar sprache aus` | Sprachmodus (Antworten vorlesen) |
| `/avatar aussehen` | Anpassen-Ansicht mit Live-Vorschau |
| `/avatar einrichten` | Checkliste für `/voice`, Stimmen und Fenstergröße |

- **Optionen bei der Installation** (`userConfig` im Manifest, später im Einstellungsmenü änderbar; eine Änderung lädt die Mod neu): Name des Assistenten, Sprache (automatisch, Deutsch, Englisch), Stimme für Deutsch, Stimme für Englisch, Ausführlichkeit, Ruhezeiten, Seitenleiste beim Start öffnen.
- **`$.store`:** Profil (Vorlage und Parameter) und zuletzt gewählte Einstellungen, für alle Sitzungen gleich.

## 9. Installation, Updates, Entwicklung

Das Repository ist zugleich die Mod und ihr Marketplace. `.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-desktop-avatar",
  "owner": { "name": "AyGeeI" },
  "plugins": [{ "name": "avatar", "source": "./" }]
}
```

`hooks/hooks.json`:

```json
{ "modules": ["./register.tsx"] }
```

**Installieren**, in einer Claude-Code-Sitzung im Terminal:

```text
/plugin install avatar --marketplace AyGeeI/claude-desktop-avatar
```

Aus einer Shell:

```bash
claude plugin install avatar --marketplace AyGeeI/claude-desktop-avatar
```

In der Desktop-App gibt es `/plugin` nicht. Dort geht es über „+" neben der Eingabe → Plugins → Add marketplace mit `AyGeeI/claude-desktop-avatar` → Add plugin. Eine Installation im Benutzerbereich aus dem Terminal gilt auch für den Code-Tab der Desktop-App.

**Aktualisieren:** `claude plugin update`, danach `/reload-plugins` in der Sitzung.

**Entwickeln:** `claude --plugin-dir <Ordner>` oder `CLAUDE_CODE_PLUGIN_DIRS` lädt die Mod direkt aus dem Arbeitsordner und bei Änderungen neu. `claude plugin validate <Ordner>` prüft Manifest und Modul, `claude plugin test <Ordner>` führt die `*.test.ts`-Dateien aus, für Terminal und Desktop. Nach dem ersten Laden liegen die Typen für den Editor unter `.claude-plugin/types/`.

## 10. Datenschutz & Sicherheit

| Daten | Wo verarbeitet | Verlässt den Rechner? |
|---|---|---|
| Prompts und Antworten | Claude Code | ja, wie immer über dein Abo |
| KI-Hilfen der Mod (`$.model.*`) | über die Sitzung | ja, wie ein Prompt; nur auf Anfrage bzw. sparsam |
| Spracheingabe (`/voice`) | Claude Code | ja, das Audio geht zur Umwandlung an Anthropic |
| Sprachausgabe | Windows | nein |
| Status-Ordner | Benutzerprofil | nein; nur reduzierte Angaben |
| Einstellungen, Profil | `$.store` | nein |

- Die Mod sendet selbst nichts ins Internet und nutzt `$.http` im Standard nicht.
- Freigaben entscheidet immer der Dialog von Claude Code. Die Mod kündigt sie nur an und nimmt sie nie per Sprache entgegen.
- PowerShell startet mit einer festen Argumentliste, ohne Shell-Zeichenkette; Text geht über stdin.
- Vorlagen sind reine Daten; die Mod importiert keine Dateien aus Vorlagen als Code.

## 11. Zu verifizieren & Quellen

**In Phase 0 zu verifizieren:**

- `$.audio.speak` unter Windows: Funktioniert es? Welche Stimmen sind wählbar? Lässt sich eine Ansage abbrechen?
- `$.audio.play` in Windows Terminal und im Code-Tab der Desktop-App
- `/voice` im Code-Tab der Desktop-App; Zusammenspiel von Tap-Modus und automatischem Senden mit `prompt.submit`
- Erkennung von „Freigabe nötig" (`tool.check`, Benachrichtigungs-Ereignis)
- Inhalt der Stücke von `turn.step` und des Ergebnisses von `turn.complete`
- Darstellung: animiertes `Svg` in der Desktop-App, `Raster` mit Halbblöcken in Windows Terminal, Aufwand pro Bild
- Gemeinsamer Status-Ordner mit zwei gleichzeitig offenen Sitzungen

**Quellen:**

- Mod-Schnittstelle: Typen (`claude-code/index.d.ts`) und Referenz, die Claude Code mitliefert; nach dem ersten Laden einer Mod unter `.claude-plugin/types/`
- Spracheingabe: <https://code.claude.com/docs/en/voice-dictation>
- Plugins & Marketplaces: <https://code.claude.com/docs/en/plugins/create>, <https://code.claude.com/docs/en/plugins/create-marketplace>
- Aufgaben-Tracking: <https://code.claude.com/docs/en/agent-sdk/todo-tracking>
- Nutzungsregeln: <https://code.claude.com/docs/en/legal-and-compliance>
