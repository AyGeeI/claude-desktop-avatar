# Claude Desktop Avatar

Ein Jarvis-artiger Assistent als **Mod für Claude Code**. Er lebt in deiner offenen Claude-Code-Sitzung, hört auf Sprachbefehle, zeigt als animierter Avatar, woran Claude gerade arbeitet, und sagt dir Bescheid, wenn Claude dich braucht.

> **Status: Planung.** Es gibt noch keinen lauffähigen Code. Der Plan liegt unter [`docs/`](docs/).

## Kernideen

- **Keine eigene App, kein Installer:** eine Erweiterung für Claude Code, aktiv, solange Claude Code geöffnet ist.
- **Sprechen statt tippen:** Aufträge über die eingebaute Spracheingabe von Claude Code (`/voice`). Befehle wie „Jarvis, Status" oder „Jarvis, stopp" erledigt der Avatar selbst.
- **Hören, was passiert:** Ansagen und kurze Antworten über die Sprachausgabe von Windows.
- **Sehen, was passiert:** ein Avatar in einer Seitenleiste neben dem Chat, als animierte Vektorgrafik in der Desktop-App und als Pixel-Art im Terminal. Dazu Fortschritt, „Freigabe nötig" und ein Überblick über alle offenen Sitzungen.
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
| [Mod-Konzept](docs/mod-design.md) | Ereignisse, Erzähler, Spracheingabe und -ausgabe, Darstellung je Oberfläche, mehrere Sitzungen, Befehle, Installation |
| [Avatar-Vorlagen](docs/avatar-templates.md) | Vorlagenformat (SVG und Pixel), Parameter, Zustände, Persona, Anpassen, Prüfung |

## Lizenz

Der Code steht unter der [MIT-Lizenz](LICENSE). Mitgelieferte Avatar-Vorlagen (Grafiken und Töne) sollen unter CC BY 4.0 stehen; die Lizenz steht jeweils im Manifest der Vorlage.

## Hinweis

Nicht kommerzielles, unabhängiges Projekt, nicht mit Anthropic verbunden. „Claude" ist eine Marke von Anthropic. „Jarvis" dient hier nur als Vergleich und Beispielname.
