# Claude Desktop Avatar

Ein Jarvis-artiger Assistent als **Mod für Claude Code**: eine animierte Figur, die frei verschiebbar auf deinem Windows-Desktop sitzt, ähnlich den Haustieren der Codex-App. Sie hört auf Sprachbefehle, zeigt, woran Claude gerade arbeitet, und sagt dir Bescheid, wenn Claude dich braucht.

> **Status: Planung.** Es gibt noch keinen lauffähigen Code. Der Plan liegt unter [`docs/`](docs/).

## Kernideen

- **Keine eigene App, kein Installer:** eine Erweiterung für Claude Code, aktiv, solange Claude Code geöffnet ist. Das Desktop-Fenster startet die Mod mit Windows-Bordmitteln (PowerShell, WPF).
- **Sehen, was passiert:** Der Avatar sitzt über allen Fenstern, wo du ihn hinziehst. Seine Sprechblase zeigt Schritte, Fortschritt und „Freigabe nötig" und kennt alle offenen Sitzungen. In Claude Code gibt es zusätzlich Statuszeile und Seitenleiste.
- **Sprechen statt tippen:** Aufträge über die eingebaute Spracheingabe von Claude Code (`/voice`) oder per Klick auf den Avatar. Befehle wie „Jarvis, Status" oder „Jarvis, stopp" erledigt der Avatar selbst.
- **Hören, was passiert:** Ansagen und kurze Antworten über die Sprachausgabe von Windows, mit Lippenbewegung.
- **Dein Stil:** Vorlagen mit anpassbaren Farben, Teilen, Name, Stimme und Persönlichkeit.
- **Über dein Abo:** Alles läuft in deiner Sitzung, ohne API-Schlüssel. Deutsch und Englisch.

## Installation (geplant)

In einer Claude-Code-Sitzung im Terminal:

```text
/plugin install avatar --marketplace AyGeeI/claude-desktop-avatar
```

In der Desktop-App: „+" neben der Eingabe → Plugins → Add marketplace mit `AyGeeI/claude-desktop-avatar` → Add plugin.

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [Projektplan](docs/PLAN.md) | Vision, Möglichkeiten und Grenzen einer Mod, Anforderungen, Architektur, Roadmap, Risiken, Entscheidungen |
| [Mod-Konzept](docs/mod-design.md) | Ereignisse, Erzähler, Spracheingabe und -ausgabe, Desktop-Begleiter, Anzeige in Claude Code, mehrere Sitzungen, Befehle, Installation |
| [Avatar-Vorlagen](docs/avatar-templates.md) | Vorlagenformat (SVG und Pixel), Parameter, Zustände, Persona, Anpassen, Prüfung |

## Lizenz

Der Code steht unter der [MIT-Lizenz](LICENSE). Mitgelieferte Avatar-Vorlagen (Grafiken und Töne) sollen unter CC BY 4.0 stehen; die Lizenz steht jeweils im Manifest der Vorlage.

## Hinweis

Nicht kommerzielles, unabhängiges Projekt, nicht mit Anthropic verbunden. „Claude" ist eine Marke von Anthropic. „Jarvis" dient hier nur als Vergleich und Beispielname.
