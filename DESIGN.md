# Scala — Apple design language

Scala is the Apple-design successor of the rectile HUD: same engine, new skin.
Direction: **visionOS / macOS dark** — frosted-glass materials over a soft
ambient wallpaper, SF-style typography, iOS system colors, generous rounding.
No neon, no cyberpunk, no terminal cosplay.

## Tokens (already defined in `app/globals.css`)

Token *names* are inherited from the old HUD, so existing Tailwind classes
(`text-accent`, `bg-panel/70`, `border-line`, …) still work — the values are:

| token         | value                | role                          |
| ------------- | -------------------- | ----------------------------- |
| `void`        | `#0a0a0f`            | page background               |
| `abyss`       | `#131318`            | elevated background           |
| `panel`       | `#1b1b22`            | card/material base            |
| `bright`      | `#f5f5f7`            | primary label                 |
| `ink`         | `#d8d8e2`            | secondary label               |
| `accent`      | `#0a84ff`            | systemBlue                    |
| `ok`          | `#30d158`            | systemGreen                   |
| `warn`        | `#ff9f0a`            | systemOrange                  |
| `danger`      | `#ff453a`            | systemRed                     |
| `dim`         | `#8e8e93`            | systemGray                    |
| `cyan`        | `#64d2ff`            | systemCyan                    |
| `line`        | `white/8%`           | hairline border               |
| `line-strong` | `white/20%`          | hover/focus border            |

Helper classes: `.glass` (frosted card, radius 16), `.glass-heavy`
(sheet/modal material, radius 20), `.btn-tint` (blue pill button),
`.btn-quiet` (quiet pill), `.field` (rounded input), `.hud-label`
(11px semibold gray section header — sentence case), `.hud-sublabel`,
`.hud-rule`, `.fade-in`, `.built-pop`.

## Conversion rules (HUD → Scala)

1. **Sentence case everywhere.** Rewrite literal ALL-CAPS strings
   (`"SYSTEM VITALS"` → `"System vitals"`), delete `.toUpperCase()` calls on
   display text, remove `uppercase` classes. Keep acronyms (XP, P1, ICS).
2. **Kill letter-spacing.** Remove every `tracking-[0.x em]` utility. Body
   inherits `-0.01em`; nothing else needed.
3. **Real font sizes.** Micro-text scales up: 8–9px → 11px, 10–11px → 12–13px,
   12px → 13px. Headlines: `text-[15px]`–`text-[22px]` semibold, large numerals
   `text-[28px]`–`text-[34px] font-semibold tracking-[-0.02em]`.
4. **Sans, not mono.** The body is now SF/Inter. Remove `font-mono` except for
   code, IDs, log timestamps, and editors. `font-display` = same sans family
   (keep the class where present; it's fine).
5. **Rounded materials instead of square panels.** `border border-line
   bg-panel/70` boxes become `.glass` (or add `rounded-2xl`). Small controls:
   `rounded-lg`–`rounded-xl`. Buttons and chips: `rounded-full` pills.
6. **No glows.** Delete `boxShadow: 0 0 Npx <color>` dot-glows and
   `textShadow` neon. Depth comes from the material shadow already in
   `.glass`. Status dots stay (2px larger, no glow): `h-1.5 w-1.5 rounded-full`.
7. **Buttons.** `border border-line-strong bg-accent/10 …` CTAs →
   `.btn-tint`; quiet bordered buttons → `.btn-quiet`. Text buttons keep
   `text-accent` (hover `text-[#409cff]`), no underline.
8. **Inputs.** `border border-line bg-panel/70 px-3 …` → `.field` (append
   sizing utilities as needed).
9. **Decorative HUD ornaments die**: corner frames, `◈ ⬡ ▸ ◂ ⌕ ●` glyph
   decorations (replace with nothing, or a clean SVG/emoji-free equivalent:
   back/forward = ‹ ›, search icon = SVG magnifier or "Search" placeholder),
   `hud-rule` dividers may stay (they're now quiet hairlines).
10. **Copy tone.** Terminal jargon → human: "INITIALIZE ▸" → "Create",
    "PRIMARY DIRECTIVE" → "Focus", "SYSTEM VITALS" → "Overview",
    "TRAINING UPLINK" → "Training", "LINK · ONLINE" → "Online",
    "ROSTER.17" sublabels → plain counts ("17 projects").
11. **Progress bars.** Track `bg-white/10 rounded-full h-1` (or 1.5), fill
    `bg-accent rounded-full` (no gradient, no glow). Green only for
    completed states.
12. **Modals/sheets** → `.glass-heavy` + `fade-in`, padding 20–24px,
    overlay `bg-black/40 backdrop-blur-sm`.
13. **Don't touch logic.** Server actions, data flow, offline queue, routes,
    aria labels, min-h touch targets (keep ≥ 36–44px) all stay.

## Type ramp (reference)

- Section header: `hud-label` (11px/600, gray)
- Body/list row: 13px/400–500, `text-bright` primary + `text-ink/60` secondary
- Subtext: 12px `text-ink/50`
- Card title: 15px/600 `text-bright`
- Page title: 22px/700 `tracking-[-0.02em]`
- Hero numeral: 28–56px/600 `tracking-[-0.03em] tabular-nums`
