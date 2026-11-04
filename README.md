# Claude Desktop Avatar

Ein anpassbarer Desktop-Begleiter für Claude. Er sitzt frei verschiebbar auf deinem Bildschirm, startet per Klick, Tastenkürzel oder Stimme einen Chat und erzählt dir mit Sprechblase und Ton, woran deine Claude-Sitzungen gerade arbeiten.

> **Status: Planung.** Es gibt noch keinen lauffähigen Code. Der Plan liegt unter [`docs/`](docs/).

## Kernideen

- **Immer da, nie im Weg:** Der Avatar schwebt über allen Fenstern, lässt sich mit der Maus verschieben und lässt Klicks neben sich durch.
- **Dein Avatar, dein Stil:** Vorlagen mit anpassbaren Farben, Teilen, Größe, Stimme, Name und Persönlichkeit. Eigene Vorlagen lassen sich ohne Programmierung bauen und teilen.
- **Schnell gefragt:** Ein Klick oder Tastenkürzel genügt, getippt oder gesprochen. Die Antwort erscheint in der Sprechblase und wird auf Wunsch vorgelesen.
- **Live dabei:** Laufende Claude-Code-Sitzungen melden ihre Schritte, ihren Fortschritt und wann sie dich brauchen. Der Avatar zeigt das an, spielt Hinweistöne und spricht Wichtiges aus.

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [Projektplan](docs/PLAN.md) | Vision, Anforderungen, Architektur, Technologie, Roadmap, Risiken, offene Entscheidungen |
| [Avatar-Vorlagen](docs/avatar-templates.md) | Vorlagenformat, Parameter, Zustände, Renderer, Avatar-Studio, Sicherheit |
| [Anbindung an Claude](docs/claude-integration.md) | Claude-Code-Plugin (Hooks), Ereignismodell, Erzähler, Schnell-Chat, MCP, Deep Links, Authentifizierung |

## Hinweis

Unabhängiges Projekt, nicht mit Anthropic verbunden. „Claude" ist eine Marke von Anthropic.
