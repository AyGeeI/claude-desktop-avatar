# Claude Desktop Avatar

Ein anpassbarer Desktop-Begleiter für Claude unter Windows. Er sitzt frei verschiebbar auf deinem Bildschirm, startet per Klick, Tastenkürzel oder Stimme einen Chat und erzählt dir mit Sprechblase und Ton, woran deine Claude-Sitzungen gerade arbeiten.

> **Status: Planung.** Es gibt noch keinen lauffähigen Code. Der Plan liegt unter [`docs/`](docs/).

## Kernideen

- **Immer da, nie im Weg:** Der Avatar schwebt über allen Fenstern, lässt sich mit der Maus verschieben und lässt Klicks neben sich durch.
- **Dein Avatar, dein Stil:** 2D-Vorlagen mit anpassbaren Farben, Teilen, Größe, Stimme, Name und Persönlichkeit. Eigene Vorlagen lassen sich ohne Programmierung bauen und teilen.
- **Schnell gefragt, über dein Abo:** Ein Klick, ein Tastenkürzel oder die Sprechtaste genügt. Die Antwort kommt über dein installiertes Claude Code und dein Claude-Abo; ein API-Schlüssel ist nicht nötig.
- **Live dabei:** Claude-Code-Sitzungen melden ihre Schritte, ihren Fortschritt und wann sie dich brauchen. Chats und Cowork-Aufgaben in Claude Desktop melden sich über einen MCP-Server, soweit Claude das tut. Der Avatar zeigt das an, spielt Hinweistöne und spricht Wichtiges aus.
- **Zweisprachig:** Oberfläche, Ansagen und Sprachsteuerung auf Deutsch und Englisch.

## Voraussetzungen (geplant)

- Windows 11
- ein Claude-Abo und ein installiertes, angemeldetes [Claude Code](https://code.claude.com/docs)

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [Projektplan](docs/PLAN.md) | Vision, Anforderungen, Architektur, Technologie, Roadmap, Risiken, Entscheidungen |
| [Avatar-Vorlagen](docs/avatar-templates.md) | Vorlagenformat, Parameter, Zustände, Renderer, Avatar-Studio, Sicherheit |
| [Anbindung an Claude](docs/claude-integration.md) | Abdeckung aller Chat-Arten, Claude-Code-Plugin (Hooks), Ereignismodell, Erzähler, Schnell-Chat über das Abo, MCP, Deep Links, Nutzungsregeln |

## Lizenz

Der Code steht unter der [MIT-Lizenz](LICENSE). Mitgelieferte Avatar-Vorlagen (Grafiken und Töne) sollen unter CC BY 4.0 stehen; die Lizenz steht jeweils im Manifest der Vorlage.

## Hinweis

Unabhängiges Projekt, nicht mit Anthropic verbunden. „Claude" ist eine Marke von Anthropic.
