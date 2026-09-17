---
name: Prop line parsing
description: Durable rules for interpreting pasted sportsbook player and stat lines.
---

Specific stat phrases must take precedence over short aliases when parsing pasted prop lines. For example, “receiving yards” must resolve to receiving yards rather than the shorter “rec” alias for receptions.

**Why:** Short aliases are useful for flexible user input, but substring matching can otherwise classify a precise section heading or stat phrase incorrectly.

**How to apply:** When adding or changing aliases, rank matching candidates by specificity or otherwise protect exact/longer matches before checking abbreviated aliases.