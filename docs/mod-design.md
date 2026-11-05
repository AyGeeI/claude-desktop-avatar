# Mod-Konzept – Ereignisse, Sprache, Desktop-Begleiter

> Teil des [Projektplans](PLAN.md) · Stand: 5. November 2026 (v0.5: umgesetzt; Protokoll in Abschnitt 6.6 entspricht dem Code).
> Die Angaben zur Mod-Schnittstelle stammen aus den Typen und der Referenz, die Claude Code für Mods mitliefert (geprüft mit Version 2.1.318), die Angaben zu `/voice` aus der offiziellen Doku. Offene Punkte prüft Phase 0.

## 1. Bausteine

| Baustein | Datei | Aufgabe | Wichtigste Schnittstellen |
|---|---|---|---|
| Einstieg | `hooks/register.tsx` | registriert alle Hooks und verbindet die Bausteine | `on(…)`, `register(on, options)` |
| Ereignis-Adapter | `src/events.ts` | übersetzt Sitzungs-Ereignisse in eigene Avatar-Ereignisse | `prompt.submit`, `tool.call`, `turn.start`, `turn.step`, `turn.complete` |
| Zustand | `src/state.ts`, `types/index.d.ts` | Avatar-Zustand, Plan, letzte Schritte; Einstellungen und Profil | `atom`, `read`, `update`, `$.store` |
| Erzähler | `src/narrator.ts` | Texte auf Deutsch und Englisch, Prioritäten, Bündelung, Drosselung | – |
| Sprache & Befehle | `src/voice.ts` | Befehle an den Avatar, Vorlesen, Warteschlange | `$.prompt.submit`, `$.turn.abort`, `$.model.*` |
| Begleiter-Steuerung | `src/companion.ts` | startet und überwacht den Desktop-Begleiter, schreibt seine Zustandsdatei, liest seine Meldungen | `$.process.spawn`, `$.fs` |
| Desktop-Begleiter | `companion/avatar.ps1` | Fenster, Avatar, Sprechblase, Eingabefeld, Sprachausgabe, Töne | Windows PowerShell 5.1, WPF, `System.Speech` |
| Sitzungen | `src/sessions.ts` | gemeinsamer Status-Ordner, Sprecher-Wahl, Aufträge an andere Sitzungen | `$.fs`, `$.clock` |
| Vorlagen | `src/templates.ts` | Vorlagen laden, prüfen und mit Parametern füllen | `$.fs` |
| Anzeige in Claude Code | `src/render/` | Statuszeile, Band, Spinner, Seitenleiste | `ui.render`, `$.ui.*`, `Svg`, `Raster` |

Die TypeScript-Bausteine sind normale Dateien des Plugins und werden statisch importiert. Laut Referenz lädt ein Modul mit dynamischem `import()` nicht. Zur Laufzeit hat die Mod weder DOM noch Node: Alles außerhalb erreicht sie über `$`.

## 2. Lebenszyklus

1. **`session.start`:** Optionen und Profil laden (`options`, `$.store`), Befehl `/avatar` registrieren und die Status-Datei der Sitzung anlegen. Ist diese Sitzung der Sprecher (Abschnitt 8), startet sie den Desktop-Begleiter; sonst meldet sie ihren Stand nur über den Status-Ordner. Optional begrüßt der Avatar („Guten Morgen. Zwei Sitzungen laufen, das API-Projekt wartet auf dich.").
2. **Während der Sitzung:** Die Hooks werten Ereignisse aus, aktualisieren den Zustand und schreiben die Zustandsdatei für den Begleiter.
3. **Ende:** Mit dem Modul endet laut Referenz auch der gestartete Begleiter-Prozess. Übernimmt eine andere Sitzung die Sprecher-Rolle, startet sie den Begleiter neu, an der gemerkten Position.
4. **Beim Entwickeln:** Ein Neuladen führt `register` und `session.start` erneut aus. `$.state` und `$.store` bleiben erhalten.

**Grundregel:** Jeder Hook reicht an `next(e)` weiter und fängt eigene Fehler ab. Die Mod beobachtet und ergänzt; sie blockiert keine Werkzeuge und entscheidet keine Freigaben.

## 3. Ereignisse → Avatar

| Ereignis der Sitzung | Was die Mod liest | Eigenes Ereignis | Wirkung |
|---|---|---|---|
| `prompt.submit` | `text`, `command`, `isMeta` | `prompt.submitted` oder ein Befehl an den Avatar | Zustand `thinking`. Befehle erledigt die Mod selbst und verwirft den Prompt (`{ drop }`); im Sprachmodus hängt sie einen Hinweis als `context` an (Abschnitt 5) |
| `turn.start` | `turnId`, `agentId` | `turn.started` | merkt sich die Haupt-Runde für „Stopp" |
| `turn.step` (Stream) | Text-, Werkzeug- und Stop-Stücke | `message.delta`, `step.planned` | zeigt früh, was Claude schreibt und welches Werkzeug startet |
| `tool.call` (vor und nach `next`) | Werkzeug, gekürzte Eingaben, Ergebnis (`isError`) | `step.started`, `step.finished`, `step.failed`, `plan.updated` | Sprechblase, Statuszeile, Fortschritt |
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

| Werkzeug / Ereignis | Sprechblase & Statuszeile | Gesprochen (Stufe „Normal") |
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

| Stufe | Sprechblase & Statuszeile | Sprache | Töne |
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
- **Fokus:** `/voice` reagiert nur, wenn das Claude-Code-Fenster im Vordergrund ist. Am Desktop-Avatar wird getippt (Abschnitt 6); gesprochene Aufträge dort wären nur über die Windows-Spracherkennung möglich (Plan F3.6).
- **Offen:** Ob `/voice` auch im Code-Tab der Desktop-App verfügbar ist, nennt die Doku nicht; Phase 0 prüft das.
- **Hilfe in der Mod:** `/avatar einrichten` zeigt diese Schritte als Checkliste und prüft, was sich lesen lässt (z. B. `voice` und `language` über `$.settings`).

### 5.2 Befehle an den Avatar

- **Erkennung** in `prompt.submit` und bei Eingaben am Desktop-Avatar: Beginnt der Text mit dem Namen des Assistenten („Jarvis, …", „Hey Jarvis …"), prüft die Mod eine kleine Liste von Befehlen mit Schlüsselwörtern auf Deutsch und Englisch. Unklare Fälle kann `$.model.classify` entscheiden.
- **Erkannte Befehle** erledigt die Mod selbst und verwirft den Prompt (`{ drop }`). Alles andere geht unverändert an Claude.

| Befehl (Beispiele) | Wirkung |
|---|---|
| „Status", „Wie ist der Stand?" | Überblick über alle Sitzungen aus dem Status-Ordner, gesprochen und in der Sprechblase |
| „Stopp", „Abbrechen" | `$.turn.abort` für die laufende Runde |
| „Leiser", „Lauter", „Still" | Ausführlichkeitsstufe ändern |
| „Was machst du gerade?" | `$.model.fork` mit niedrigem Effort: ein Satz zum aktuellen Stand der Sitzung |
| „Zusammenfassung" | die letzte Antwort in zwei Sätzen (`$.model.complete` mit `haiku`) |
| „Wiederholen" | letzte Ansage noch einmal |

Dieselben Befehle gibt es getippt als `/avatar status`, `/avatar stopp` usw.

**Sprachmodus:** Ob ein Prompt diktiert oder getippt wurde, kann die Mod nicht unterscheiden; das Diktat erscheint für sie wie jede andere Änderung durch Claude Code. Deshalb gibt es einen Schalter `/avatar sprache an`. Ist er an, bekommt jeder Prompt den Hinweis als `context`: „Beginne mit ein bis zwei kurzen, gut vorlesbaren Sätzen; Details danach." Den Anfang der Antwort liest der Avatar dann vor. Aufträge, die am Desktop-Avatar eingetippt werden, bekommen den Hinweis immer.

### 5.3 Ausgabe

- **Mit Begleiter (Standard):** Die Mod schreibt Ansagen in die Zustandsdatei; der Begleiter spricht sie über `System.Speech` mit Mundbewegung (Abschnitt 6.5).
- **Ohne Begleiter (Rückfall):** `$.audio.speak(text, { voice })`. Wie sich das unter Windows verhält, ist nicht dokumentiert; notfalls ein kurzer PowerShell-Aufruf pro Ansage mit `System.Speech`, der Text über stdin.
- **Warteschlange:** Dringendes zuerst, Veraltetes verwerfen. Startet ein neuer Prompt oder kommt „Stopp", verstummt der Avatar (Barge-in).
- **Was gesprochen wird:** die Ansagen des Erzählers und im Sprachmodus der vorlesbare Einstieg der Antwort (höchstens ca. 300 Zeichen). Fehlt ein solcher Einstieg, fasst `$.model.complete` die Antwort optional in einem Satz zusammen.
- **Töne:** WAV-Dateien unter `sounds/`, abgespielt vom Begleiter. Ohne Begleiter über `$.audio.play`, das laut Doku in einem Windows-Terminal allerdings nichts abspielt.

## 6. Desktop-Begleiter

Der Begleiter ist das Fenster, in dem der Avatar auf dem Desktop sitzt, ähnlich wie die Haustiere in der Codex-App. Er ist ein PowerShell-Skript im Plugin und nutzt nur, was in Windows enthalten ist: Windows PowerShell 5.1, WPF (.NET Framework) und `System.Speech`.

### 6.1 Start und Ende

- Die Sprecher-Sitzung startet ihn in `session.start` mit `$.process.spawn` als Prozess, der so lange lebt wie die Sitzung, sinngemäß:

  ```text
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass
    -File "<Plugin>\companion\avatar.ps1" -StateDir "%USERPROFILE%\.claude-desktop-avatar"
  ```

- `-ExecutionPolicy Bypass` gilt nur für diesen einen Prozess. Schreibt eine Gruppenrichtlinie die Ausführungsrichtlinie vor oder läuft PowerShell im eingeschränkten Sprachmodus, scheitert der Start. Die Mod erkennt das und wechselt zur Anzeige in Claude Code.
- **Konsolenfenster:** Aus einem Terminal gestartet, teilt sich der Begleiter dessen Konsole, und es erscheint kein neues Fenster. Aus der Desktop-App könnte ein Konsolenfenster aufblitzen. Dann blendet der Begleiter nur seine eigene Konsole aus, nie das Terminal. Phase 0 prüft das.
- **Ende:** Endet die Sitzung oder wird die Mod entladen, endet laut Referenz auch der Prozess. Zur Sicherheit beendet sich der Begleiter selbst, wenn seine Zustandsdatei 15 s lang keinen Herzschlag mehr bekommt.
- **Absturz:** Die Mod startet ihn bis zu dreimal neu, danach bleibt es bei der Anzeige in Claude Code.

### 6.2 Fenster

- WPF-Fenster mit `WindowStyle=None`, `AllowsTransparency=True`, transparentem Hintergrund, `Topmost=True`, `ShowInTaskbar=False` und `ShowActivated=False`. Es nimmt anderen Fenstern also keinen Fokus weg.
- **Klicks durch:** Bei solchen Fenstern lässt Windows Klicks auf völlig transparente Pixel an das Fenster darunter durch. Die Figur und die Sprechblase sind undurchsichtig und reagieren, der Rest des Fensters nicht.
- **Position:** wird beim Loslassen in `position.json` gespeichert (Monitor und relative Lage). Beim Start klemmt der Begleiter sie in den sichtbaren Bereich, falls ein Monitor fehlt.
- **Skalierung:** Er läuft DPI-bewusst pro Monitor, damit er auch auf Monitoren mit unterschiedlicher Skalierung scharf bleibt (Phase 0).
- **Vollbild & Präsentationen:** Alle 2 s fragt er `SHQueryUserNotificationState` ab und blendet sich bei Vollbild-Apps, Präsentationen und Windows-Ruhezeiten aus.

### 6.3 Bedienung

| Aktion | Wirkung |
|---|---|
| Ziehen | verschieben (ab ca. 4 px Bewegung, sonst gilt es als Klick) |
| Klick | Sprechblase mit Eingabefeld; Enter sendet den Auftrag, Esc schließt |
| Doppelklick | Status ansagen |
| Rechtsklick | Menü: Status, Leise · Normal · Gesprächig, Aussehen, 1 Stunde ausblenden, Beenden |
| Mausrad über dem Avatar | Größe ändern |

Bei mehreren Sitzungen zeigt das Eingabefeld eine Auswahl der Sitzung; Standard ist die zuletzt genutzte.

### 6.4 Darstellung

- Der Avatar kommt aus der **Pixel-Variante** der Vorlage ([Avatar-Vorlagen](avatar-templates.md), Abschnitt 8). Der Begleiter zeichnet sie in ein Bitmap und vergrößert sie ohne Weichzeichnen (Nearest Neighbor), z. B. auf das 4-Fache. So bleibt sie in jeder Größe scharf.
- Die Animation läuft über einen Zeitgeber mit höchstens ca. 12 Bildern pro Sekunde, im Leerlauf langsamer.
- Die **Sprechblase** zeigt aktuellen Schritt, Fortschritt, wartende Sitzungen und kurze Antworten. Sie klappt je nach Bildschirmrand nach links oder rechts.

### 6.5 Sprache und Töne

- `System.Speech.Synthesis.SpeechSynthesizer` mit einer Stimme je Sprache aus Profil oder Vorlage, z. B. „Microsoft Hedda Desktop" für Deutsch und „Microsoft Zira Desktop" für Englisch, sofern installiert.
- **Lippenbewegung:** Das Ereignis `VisemeReached` meldet beim Sprechen die Mundform. Der Begleiter ordnet sie den Mund-Frames der Vorlage zu (geschlossen, halb, offen, rund).
- **Abbrechen:** `SpeakAsyncCancelAll` bei Barge-in oder „Stopp".
- **Töne:** `System.Media.SoundPlayer` spielt die WAV-Dateien der Vorlage oder der Mod.

### 6.6 Verbindung zur Mod

- **Start:** `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Sta -File companion\avatar.ps1 -StateDir <Datenordner> -PluginRoot <Mod-Ordner> -Owner <Sitzung>`. Das Skript übersetzt `Companion.cs` einmal je Quelltextstand zu `companion\bin\Companion-<hash>.dll` und startet das Fenster. Ein benannter Mutex verhindert zwei Fenster.
- **Mod → Begleiter:** Die Mod schreibt `companion\state.json` (alle 2 s und bei jeder Änderung); der Begleiter liest die Datei alle 120 ms. `$.process.spawn` kann stdin nur einmal beim Start beschreiben, deshalb der Weg über die Datei. Liest der Begleiter einen halb geschriebenen Stand, liest er einfach noch einmal.

  ```json
  {
    "v": 1, "seq": 42, "heartbeatAt": 1762300000000, "owner": "3f6c…", "quit": false,
    "visible": true, "ghost": false, "lang": "de", "name": "Vela",
    "mood": "working", "title": "Vela · arbeitet", "step": "Tests laufen",
    "plan": { "done": 2, "total": 7, "current": "Tests reparieren" }, "attention": "",
    "bubble": { "n": 12, "lines": ["webshop-api · 2/7 · Tests laufen"], "isUrgent": false, "showMs": -1 },
    "sessions": [
      { "id": "3f6c…", "project": "webshop-api", "mood": "working", "label": "arbeitet", "step": "Tests laufen", "needsYou": false, "isSelf": true },
      { "id": "9a2e…", "project": "api", "mood": "attention", "label": "braucht dich", "step": "", "needsYou": true, "isSelf": false }
    ],
    "say": [{ "n": 7, "text": "Ich brauche deine Freigabe.", "lang": "de", "isUrgent": true, "at": 1762299999000 }],
    "stopSpeech": 0,
    "sound": { "n": 3, "path": "C:\\…\\sounds\\attention.wav" },
    "template": { "dir": "C:\\…\\templates\\vela", "file": "pixel.json", "params": { "glow": "#00e5ff" }, "scale": 4 },
    "speech": { "enabled": true, "voiceDe": "", "voiceEn": "" },
    "hotkey": "Ctrl+Alt+Space", "verbosity": "normal", "voiceMode": false
  }
  ```

  `bubble.showMs`: größer 0 = so lange zeigen, 0 = bis „Achtung“ vorbei ist, −1 = nur Laufschrift. Neue Einträge in `say`, `sound` und `bubble` erkennt der Begleiter an der Nummer `n`; `stopSpeech` zählt Abbrüche hoch.

- **Begleiter → Mod:** eine JSON-Zeile pro Meldung auf stdout (nur ASCII, alles andere als `\uXXXX`), die die Mod über den Ereignisstrom von `$.process.spawn` liest:

  ```text
  {"type":"ready","version":1,"voices":[{"name":"Microsoft Hedda Desktop","culture":"de-DE"}],"canSpeak":true,"uiCulture":"de-DE"}
  {"type":"prompt","text":"Wie formatiere ich ein Datum nach ISO 8601?","session":"9a2e…"}
  {"type":"command","name":"verbosity","value":"quiet"}
  {"type":"speaking","isSpeaking":true}
  {"type":"spoken","n":7}
  {"type":"moved","x":1610,"y":880,"scale":5}
  {"type":"alive"}
  {"type":"log","message":"Tastenkürzel Ctrl+Alt+Space ist schon belegt."}
  ```

  Befehle: `status`, `stop`, `summary`, `repeat`, `usage`, `verbosity`, `voiceMode`, `speech`, `ghost`, `test`, `quit`.

- **Ende:** `quit: true` in der Zustandsdatei, eine andere Sitzung als `owner` für mehr als 6 s, 20 s ohne neuen Stand (nach dem Ruhezustand mit Schonfrist) oder eine geschlossene Ausgabe (die Mod ist weg) beenden den Begleiter. Stürzt er ab, startet die Mod ihn neu, höchstens dreimal in fünf Minuten.
- Aufträge prüft die Mod wie in Abschnitt 5.2 und schickt sie mit `$.prompt.submit({ text, asUser: true })` an die Sitzung. Für eine andere Sitzung landet der Auftrag in deren Eingangsdatei (Abschnitt 8).

## 7. Anzeige in Claude Code

Zusätzlich zum Desktop-Avatar und als Rückfall zeigt die Mod den Zustand auch in Claude Code:

| Oberfläche | Seitenleiste (optional) | Immer |
|---|---|---|
| Desktop-App (Code-Tab) | `Svg` mit `isInteractive`: CSS- und SMIL-Animation in einem Sandbox-Rahmen | Statuszeile, Band, Spinner; optional Hintergrund (`$.ui.backdrop`) |
| Terminal (Windows Terminal) | `Raster`: Pixel-Art aus Halbblock-Zeichen (`▀`) in True Color, neu gezeichnet über `$.ui.blit` | Statuszeile, Band, Spinner |
| VS Code | `Svg` als Bild: Animation läuft, Hover nicht | Statuszeile, Band, Spinner |

- **Platz im Terminal:** Ungefragt öffnet sich die Seitenleiste ab 144 Spalten, nach `/avatar` in jeder Breite; im Vollbild-Modus dockt sie neben dem Chat an.
- **Spinner:** Die Zeile „Denkt nach …" zeigt den Avatar-Zustand und den aktuellen Schritt statt des Standardworts.

## 8. Mehrere Sitzungen

Jede offene Claude-Code-Sitzung hat ihre eigene Instanz der Mod. Sie verständigen sich über einen gemeinsamen Ordner, ganz ohne Server.

- **Ordner:** `%USERPROFILE%\.claude-desktop-avatar\sessions\`
- **Schreiben:** Jede Instanz schreibt bei Änderungen (höchstens alle 500 ms) und als Herzschlag alle 5 s ihre Datei `<session_id>.json` mit Projekt, Zustand, aktuellem Schritt, Fortschritt und „wartet auf dich".
- **Aufräumen:** Dateien ohne Herzschlag seit 30 s gelten als beendet und werden gelöscht.
- **Sprecher-Wahl:** Nur die Instanz, die `speaker.json` hält (Sitzungs-ID und Herzschlag), startet den Desktop-Begleiter und spricht, für alle Sitzungen. Ist ihr Herzschlag älter als 10 s, übernimmt die nächste. Damit die Sprecher-Rolle nicht ständig wechselt, gibt es keine Übernahme ohne Ausfall. Bei gleichzeitigen Übernahmen liest die Mod nach dem Schreiben zurück.
- **Aufträge an andere Sitzungen:** Wählt man im Eingabefeld des Desktop-Avatars eine andere Sitzung, schreibt der Sprecher den Auftrag in deren Eingangsdatei `<session_id>.inbox.json`. Die Instanz dieser Sitzung prüft die Datei alle 1–2 s und schickt den Auftrag mit `$.prompt.submit` ab.

## 9. Befehle & Einstellungen

| Befehl | Wirkung |
|---|---|
| `/avatar` | Seitenleiste in Claude Code öffnen oder schließen |
| `/avatar zeigen` · `/avatar verstecken` | Desktop-Avatar ein- oder ausblenden |
| `/avatar status` | Überblick über alle Sitzungen, auch gesprochen |
| `/avatar leise` · `/avatar normal` · `/avatar gesprächig` | Ausführlichkeit |
| `/avatar sprache an` · `/avatar sprache aus` | Sprachmodus (Antworten vorlesen) |
| `/avatar aussehen` | Anpassen mit Live-Vorschau |
| `/avatar einrichten` | Checkliste für `/voice`, Stimmen und Desktop-Avatar |
| `/avatar neustart` | Desktop-Begleiter neu starten |

- **Optionen bei der Installation** (`userConfig` im Manifest, später im Einstellungsmenü änderbar; eine Änderung lädt die Mod neu): Name des Assistenten, Sprache (automatisch, Deutsch, Englisch), Stimme für Deutsch und für Englisch, Ausführlichkeit, Ruhezeiten, Desktop-Avatar an oder aus.
- **`$.store`:** Profil (Vorlage, Parameter, Größe) und zuletzt gewählte Einstellungen, für alle Sitzungen gleich. Die Position merkt sich der Begleiter selbst.

## 10. Installation, Updates, Entwicklung

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

**Entwickeln:** `claude --plugin-dir <Ordner>` oder `CLAUDE_CODE_PLUGIN_DIRS` lädt die Mod direkt aus dem Arbeitsordner und bei Änderungen neu. `claude plugin validate <Ordner>` prüft Manifest und Modul, `claude plugin test <Ordner>` führt die `*.test.ts`-Dateien aus, für Terminal und Desktop. Das Skript des Begleiters lässt sich einzeln starten und mit Pester testen.

## 11. Datenschutz & Sicherheit

| Daten | Wo verarbeitet | Verlässt den Rechner? |
|---|---|---|
| Prompts und Antworten | Claude Code | ja, wie immer über dein Abo |
| KI-Hilfen der Mod (`$.model.*`) | über die Sitzung | ja, wie ein Prompt; nur auf Anfrage bzw. sparsam |
| Spracheingabe (`/voice`) | Claude Code | ja, das Audio geht zur Umwandlung an Anthropic |
| Sprachausgabe und Töne | Desktop-Begleiter (Windows) | nein |
| Zustandsdatei, Status-Ordner, Position | Benutzerprofil | nein; nur reduzierte Angaben |
| Einstellungen, Profil | `$.store` | nein |

- Mod und Begleiter öffnen selbst keine Netzwerkverbindung; `$.http` wird nicht genutzt.
- Das Skript des Begleiters liegt lesbar im Plugin. Gestartet wird es mit fester Argumentliste, ohne Shell-Zeichenkette, ohne verschlüsselte Befehle und ohne Tastatur-Hooks.
- Freigaben entscheidet immer der Dialog von Claude Code. Die Mod kündigt sie nur an und nimmt sie nie per Sprache oder am Desktop-Avatar entgegen.
- Aufträge vom Desktop-Avatar sind normale Prompts und unterliegen allen Freigabe-Regeln von Claude Code.
- Vorlagen sind reine Daten; weder Mod noch Begleiter führen etwas daraus aus.

## 12. Zu verifizieren & Quellen

**In Phase 0 zu verifizieren:**

- Begleiter: Start aus Terminal und Desktop-App, Konsolenfenster, Klicks durch transparente Pixel, Ziehen, `Topmost`, DPI auf mehreren Monitoren, Start- und Speicherbedarf, Ende mit der Sitzung
- Sprachausgabe im Begleiter: Stimmen DE/EN, `VisemeReached`, Abbrechen; Töne
- Verbindung: Latenz über Zustandsdatei und stdout
- Verhalten unter Gruppenrichtlinien und im eingeschränkten Sprachmodus (sauberer Rückfall)
- `/voice` im Code-Tab der Desktop-App; Tap-Modus mit automatischem Senden und `prompt.submit`
- Erkennung von „Freigabe nötig" (`tool.check`, Benachrichtigungs-Ereignis)
- Inhalt der Stücke von `turn.step` und des Ergebnisses von `turn.complete`
- gemeinsamer Status-Ordner, Sprecher-Wahl und Eingangsdateien mit zwei offenen Sitzungen

**Quellen:**

- Mod-Schnittstelle: Typen (`claude-code/index.d.ts`) und Referenz, die Claude Code mitliefert; nach dem ersten Laden einer Mod unter `.claude-plugin/types/`
- Spracheingabe: <https://code.claude.com/docs/en/voice-dictation>
- Plugins & Marketplaces: <https://code.claude.com/docs/en/plugins/create>, <https://code.claude.com/docs/en/plugins/create-marketplace>
- Aufgaben-Tracking: <https://code.claude.com/docs/en/agent-sdk/todo-tracking>
- Transparente WPF-Fenster und Klicks durch transparente Pixel: <https://learn.microsoft.com/en-us/archive/blogs/dwayneneed/transparent-windows-in-wpf>
- Codex-Haustiere (Vergleich): <https://letsdatascience.com/news/openai-introduces-codex-pets-animated-coding-companions-f3125f76>
