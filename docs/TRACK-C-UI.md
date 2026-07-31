# Track C — UI, type and layout spec

> Companion to [`TRACK-C-DESIGN.md`](TRACK-C-DESIGN.md). That file is structure and state; this one is pixels.
> Every value here is implementable as-is. Where a value is a judgement call, the reason is next to it.

---

## 0. The three constraints everything is designed against

**1. A projector, four metres, ten minutes.** Judges see dozens of demos. The screen is washed out, the contrast is worse than your monitor, and nobody leans in. Anything that needs leaning in does not exist.

**2. Three legible things per screen.** Not thirty. Hierarchy is the whole job: one thing large, one thing coloured, everything else quiet and out of the way until asked for.

**3. Peak and end.** People remember the peak moment and the last thing they saw, not the average. The peak is the graph changing live; the end is the Signals page. Those two get the design budget. Everything else is competent and silent.

---

## 1. What to steal, and from where

Naming a reference is useless without saying what to take from it. These are load-bearing.

| Source | Take exactly this |
| --- | --- |
| **Linear** | Elevation on dark via **1px borders at low alpha, never shadows**. Row anatomy: glyph · title · muted meta, with a hover fill. 13–15px UI text with tight tracking. |
| **Atlassian Design System** | The **lozenge**: squarish, uppercase, 11–12px, coloured fill at low alpha. Also its severity vocabulary. Atlassian is a sponsor — speaking their component language reads as domain-literate. |
| **Obsidian graph view** | The stated aesthetic target (PLAN §4.3): near-black canvas, soft node glow, edges thin and low-alpha so nodes stay dominant. |
| **Vercel / Geist** | Monochrome base, a single accent, and the **monospace system-status strip**. That strip is what makes software look like infrastructure. |
| **Stripe docs** | **Monospace for identifiers**, and callouts marked by a left rule rather than a box. Both used here for source quotes and the AI summary. |
| **Datadog / Sentry** | **Severity-first ordering** and "last seen" chips. Status is dual-encoded — colour *and* glyph — so it survives colour blindness and bad projectors. |
| **NYT / The Pudding graphics** | **Annotation-led storytelling**: label the interesting bit before the reader has to hunt for it. This is the contradiction card's eyebrow-and-rail. |
| **Raycast / Arc** | Inline `kbd` chips as ambient hints. A presenter who never touches the mouse looks like they built the thing. |

**One anti-pattern, deliberately avoided:** the generic dark-SaaS look — purple gradient hero, glassmorphism, rounded-everything, 4 shadows deep. It photographs badly, bands on projectors, and every third hackathon demo looks like it. Flat surfaces, hairline borders, one accent.

---

## 2. Colour

### 2.1 Tokens

```ts
// lib/theme.ts — single source of truth. Track B imports this;
// a canvas can only consume hex strings, it cannot use utility classes.

export const BG          = '#0B0E17';  // never #000 — pure black bands and greys out on projectors
export const SURFACE_1   = '#121727';
export const SURFACE_2   = '#171E33';
export const BORDER      = 'rgba(255,255,255,0.07)';
export const BORDER_HI   = 'rgba(255,255,255,0.12)';

export const TEXT        = '#EAEEF7';
export const TEXT_DIM    = '#9AA6C2';
export const TEXT_FAINT  = '#6B778F';  // decorative only — fails AA, never for content

export const ACCENT      = '#7C6CFF';  // Athena: selection, AI-authored, primary action
export const ACCENT_TEXT = '#A99BFF';  // the small-text-safe variant of ACCENT
export const PULSE       = '#22D3EE';  // "changed in the last 30s"

export const STATUS_COLOR: Record<Status, string> = {
  done:        '#34D399',
  in_progress: '#38BDF8',
  at_risk:     '#FBBF24',
  blocked:     '#FB4E6D',
  not_started: '#8695AD',
};

export const STATUS_GLYPH: Record<Status, string> = {
  done: '✓', in_progress: '◐', at_risk: '!', blocked: '✕', not_started: '○',
};
```

### 2.2 Measured contrast against `#0B0E17`

| Token | Ratio | Verdict |
| --- | --- | --- |
| `TEXT` `#EAEEF7` | **16.6 : 1** | body, headings |
| `TEXT_DIM` `#9AA6C2` | **7.9 : 1** | secondary text, safe at 12px |
| `ACCENT_TEXT` `#A99BFF` | **8.1 : 1** | accent text at any size |
| `ACCENT` `#7C6CFF` | **5.0 : 1** | borders, fills, ≥16px text only |
| `at_risk` `#FBBF24` | **11.5 : 1** | ✓ |
| `done` `#34D399` | **10.0 : 1** | ✓ |
| `PULSE` `#22D3EE` | **10.7 : 1** | ✓ |
| `in_progress` `#38BDF8` | **9.0 : 1** | ✓ |
| `blocked` `#FB4E6D` | **5.9 : 1** | ✓ |
| `not_started` `#8695AD` | **6.4 : 1** | ✓ — the obvious `#64748B` measures 4.05 and fails |
| `TEXT_FAINT` `#6B778F` | 4.4 : 1 | ✗ decoration only |

### 2.3 Two colour decisions worth defending

**The accent is violet, not Mistral orange.** Orange collides with `at_risk` amber. At four metres a judge cannot separate "the AI wrote this" from "this is in trouble" — and both meanings appear in the same panel, often in the same row. The Mistral nod goes in a single orange dot beside "Powered by Mistral" in the footer. Never contaminate a status ramp with a brand colour.

**Status is dual-encoded, colour plus glyph.** Roughly 8% of men have a red-green deficiency; the odds that no judge on the panel does are poor. The glyph costs nothing and it also survives a projector that renders greens as grey.

### 2.4 Four visual channels — agreed with Track B, no overlap

| Channel | Encodes |
| --- | --- |
| Node fill | `status` |
| Ring, `ACCENT` 2px | selected |
| Outer glow pulse, `PULSE` | changed in the last 30s |
| Opacity → 35% | filtered out by a signal |

Keeping these orthogonal is why the graph stays readable when three things are true at once.

### 2.5 Elevation, without shadows

Box-shadows are invisible on dark backgrounds and band on projectors. Layer with fills and hairlines instead.

| Level | Fill | Border | Use |
| --- | --- | --- | --- |
| L0 | `BG` | — | page, canvas |
| L1 | `SURFACE_1` | 1px `BORDER` | drawer, cards, textarea |
| L2 | `SURFACE_2` | 1px `BORDER_HI` | quote blocks, popovers, KPI tiles |

---

## 3. Type

### 3.1 Families

```ts
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
```

| Role | Family | Why |
| --- | --- | --- |
| Display, headings | **Space Grotesk** 600 | Geometric grotesque with actual character; free; sits close to the hackathon deck's heavy rounded display type |
| UI, body | **Inter** 400 / 500 / 600 | Highest legibility per pixel at small sizes on screens |
| IDs, timestamps, quotes, status strip | **JetBrains Mono** 400 / 600 | Monospace on identifiers reads as *real data*. This is a credibility cue, not a typographic one. |

### 3.2 Scale

| Token | Size / line | Family, weight | Tracking | Used for |
| --- | --- | --- | --- | --- |
| `display` | 30 / 34 | Space Grotesk 600 | −0.02em | Team name in the panel header |
| `kpi` | 34 / 36 | Space Grotesk 600 | −0.01em | KPI numbers — `tabular-nums` |
| `h2` | 20 / 26 | Space Grotesk 600 | −0.01em | Page titles on `/signals`, `/import` |
| `eyebrow` | 11 / 14 | Inter 600 UPPER | +0.09em | Section labels — the quiet workhorse |
| `body` | 15 / 22 | Inter 400 | 0 | Summaries, prose |
| `row` | 15 / 20 | Inter 500 | −0.005em | Task and member titles |
| `meta` | 12 / 16 | JetBrains Mono 400 | 0 | Timestamps, ids, counts |
| `badge` | 10 / 12 | JetBrains Mono 600 UPPER | +0.10em | Source badges |
| `pill` | 12 / 12 | Inter 600 UPPER | +0.06em | Status lozenges |

**Body never goes below 15px anywhere in this app.** The `meta` and `badge` sizes are permitted below that only because they carry redundant information — remove them and nothing is lost.

Measure caps at **62ch**. The drawer is narrow enough that this only binds on `/signals` and `/import`, where content is centred at 820px and 760px respectively.

---

## 4. Space, radius, motion

**Spacing — 4px base.** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Drawer padding 24. Card padding 16. Section gap 24. Row padding 12/16.

**Radius.** `4` badges · `5` status lozenges · `8` buttons, quote blocks · `10` cards, popovers · `12` textarea, contradiction card. Nothing is fully rounded — a pill shape reads as *tag*, a squared lozenge reads as *status*.

**Motion.**

| What | Duration | Easing |
| --- | --- | --- |
| Drawer slide | 220ms | `cubic-bezier(.22,1,.36,1)` |
| Graph pan (`centerAt`) | 400ms | library default |
| Change flash | 1200ms | `ease-out` |
| Popover | 120ms | `ease-out` |
| Ticker row entry | 200ms | `ease-out` |
| Hover fill | 90ms | `linear` |

Nothing else animates. Motion carries information here; it is not decoration. 220ms is chosen because a slower panel wastes demo seconds and a faster one reads as a jump cut.

```css
@keyframes flash { from { background: rgb(124 108 255 / .18); } to { background: transparent; } }
.row-changed { animation: flash 1200ms ease-out; border-left-color: var(--accent); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

The reduced-motion query is four lines and it is a sentence you can say to judges about responsibility.

---

## 5. Layout

**No left rail.** A 72px icon rail is a SaaS reflex, but here the canvas *is* the product and vertical space at 720p is scarce. Top bar only.

### 5.1 Home — `/` at 1440 × 900

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ● ATHENA  second brain for a project    Graph  Signals  Import   ◉ 47n·63e·2s ago │ 56
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                     ░┃                            │
│                                                     ░┃  ENGINEERING            ✕  │
│                ○────●                               ░┃  ● at risk                 │
│               ╱      ╲                              ░┃  ┌──────┬──────┬──────┐    │
│          ●───◉        ●───○                         ░┃  │  7   │  2   │  1   │    │
│              ╱ ╲                                    ░┃  │TASKS │BLOCKD│STALE │    │
│             ○   ●                                   ░┃  └──────┴──────┴──────┘    │
│                                                     ░┃                            │
│                                                     ░┃  ▌⚠ CONTRADICTION          │
│  ┌────────────────────────┐                         ░┃  Engineering says auth      │
│  │ ✓ done   ◐ in progress │                         ░┃  shipped; Ops is blocked.   │
│  │ ✕ blocked  ! at risk   │  legend, 24px from edge ░┃  ┌─────────┐ ┌─────────┐   │
│  │ ○ not started          │                         ░┃  │ "auth…" │ │ "still…"│   │
│  └────────────────────────┘                         ░┃  └─────────┘ └─────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
                                        32px gradient bleed ─┘   clamp(380px,32vw,520px)
```

**The drawer is opaque, with a gradient bleed on its left edge.** No `backdrop-filter` — a blur over a running force simulation repaints every frame and drops the framerate exactly when the graph is supposed to look alive. The 32px `transparent → BG` gradient gives the layered feel for free.

```css
.drawer { background: var(--surface-1); border-left: 1px solid var(--border); }
.drawer::before {
  content: ''; position: absolute; left: -32px; top: 0; bottom: 0; width: 32px;
  background: linear-gradient(to right, transparent, var(--bg)); pointer-events: none;
}
```

### 5.2 Top bar — 56px

Left: a 6px `ACCENT` dot · `ATHENA` in Space Grotesk 18px / −0.02em · then the tagline **"second brain for a project"** at 11px `TEXT_DIM`, hidden below 1100px.

That tagline is not decoration. Judges glance at screens without hearing the pitch, and it means a silent screen still explains itself.

Centre: `Graph · Signals · Import` — 14px Inter 500, active tab gets `TEXT` plus a 2px `ACCENT` underline, inactive `TEXT_DIM`. A `kbd` chip after each label (`g` `s` `i`).

Right: `47 nodes · 63 edges · synced 2s ago` in JetBrains Mono 11px `TEXT_DIM`, preceded by a **6px dot that flashes `PULSE` for 400ms on every successful poll**.

That heartbeat is the highest-value six pixels in the app. It says *live system* continuously, including in the long stretches where nothing is changing and the presenter is still talking.

### 5.3 Responsive

| Width | Behaviour |
| --- | --- |
| ≥ 1280 | Drawer overlays, graph pans aside |
| 1024–1279 | Drawer → 380px, tagline hidden |
| < 1024 | Drawer becomes a full-width bottom sheet at 70vh |

Mobile is explicitly out of scope (PLAN §5). The bottom sheet exists so a judge opening it on a phone sees something coherent rather than a broken layout — that is the entire ambition.

---

## 6. Component anatomy

### 6.1 `StatusPill`

```
┌──────────────┐   height 22 · padding 0 8 · radius 5 · gap 4
│ ✕  BLOCKED   │   glyph 12 · label 12 Inter 600 UPPER +0.06em
└──────────────┘   bg color/14% · border 1px color/38% · text color
```

### 6.2 `TaskRow` — 52px, two lines

```
┌────────────────────────────────────────────────────────────────┐
│▏[✕ BLOCKED]  Rollback runbook                    2h ago  [DM] │  ← row 15/500
│▏             (PS) Priya Shah · due Aug 2                       │  ← meta 12 mono DIM
└────────────────────────────────────────────────────────────────┘
 ↑ 2px left border: transparent → ACCENT while isRecent(id)
```

- Hover `rgb(255 255 255 / .03)`; focus-visible → focus ring (§8)
- Avatar 20px circle, 10px initials, fill from `hash(personId) % 6` muted hues
- **Unowned** replaces the avatar with a 20px dashed circle and the word `unowned` in `at_risk` amber. Conspicuous on purpose — it is a thing the presenter points at, and it is one of Track F's signals.

### 6.3 `ContradictionCard` — the hero

```
┌─────────────────────────────────────────────────────────┐
│▌ ⚠ CONTRADICTION                                        │  eyebrow, blocked colour
│▌                                                        │
│▌ Engineering says auth shipped; Ops is still            │  17/24 Inter 500, TEXT
│▌ blocked on it.                                         │
│▌                                                        │
│▌ ┌───────────────────────┐ ┌───────────────────────┐   │
│▌ │ ENGINEERING           │ │ OPS                   │   │  10 mono UPPER, DIM
│▌ │ "auth is done,        │ │ "still waiting on     │   │  14/20 Inter, TEXT
│▌ │  shipped Thursday"    │ │  auth, we're blocked" │   │
│▌ │ [DM] 4h ago           │ │ [DM] 1h ago           │   │  11 mono, DIM
│▌ └───────────────────────┘ └───────────────────────┘   │
└─────────────────────────────────────────────────────────┘
 ↑ 3px solid blocked-colour rail
```

Card: `blocked` at 6% fill, 1px `blocked` at 28%, radius 12, padding 16, 3px left rail.
Quote blocks: L2, radius 8, padding 12, `grid-template-columns: 1fr 1fr`, gap 8 — stacked below 440px drawer width.

The eyebrow-and-rail is the annotation-led pattern from editorial graphics: it tells the reader *this is the interesting bit* before they have read a word. This card will end up in the pitch deck screenshot. Build it properly.

### 6.4 `AiSummary`

2px `ACCENT` left rule, 16px left padding, body 15/22. Above it an eyebrow: `◆ ATHENA · AI SUMMARY` in `ACCENT_TEXT`.

Labelling it as model output separates *what the AI wrote* from *what a human said*. That is both honest and directly on the "AI should support human thinking" criterion.

### 6.5 `FreshnessChip`

| State | Render |
| --- | --- |
| `live` (<2m) | `PULSE` text + 4px filled dot |
| `fresh` (<6h) | `TEXT_DIM`, plain |
| `aging` (<24h) | `TEXT_DIM` + 4px hollow amber dot |
| `stale` (≥24h) | `at_risk` text + `!`, dotted underline |

12px JetBrains Mono. `title` carries the absolute ISO timestamp.

**Freshness is on the chip, not the row's opacity.** Fading stale rows is the tempting metaphor — information decay is the product thesis — but faded text on a projector is text nobody reads. The signal moves to the chip; the content stays at full contrast.

### 6.6 `SourceBadge` + `SourcePopover`

Badge: 10px mono uppercase, `SEED` / `DOC` / `DM`, 1px `BORDER`, radius 4, padding 0 5, height 16. Hover → border `ACCENT`.

**Click to open, not hover.** A presenter's mouse is jittery and a hover popover flickers on a projector. Popover: 320px, L2, radius 10, padding 16 — badge and ref on the top row, then the verbatim quote behind a 2px `ACCENT` rule, then `via Discord DM · 2026-08-01 09:14` in 11px mono. Closes on outside click and on `Esc`.

Missing `sourceRef` renders the literal word `unsourced` in `TEXT_FAINT`. Do not hide it. Showing the gap is more credible than implying completeness.

### 6.7 `KpiTile`

L1, radius 10, padding 16. Number `kpi` with `tabular-nums`, label `eyebrow` in `TEXT_DIM`. The contradictions tile flips to `blocked` fill at 8% with a `blocked` border when its value exceeds zero — the overview turns red on its own.

### 6.8 `ActivityTicker`

```
09:14  task.rollback-runbook   → blocked        [DM]
09:12  blocker.legal-retention  + created       [DM]
08:47  team.legal               ~ summary        [DOC]
```

Time and id in 12px mono truncated with `text-overflow: ellipsis`; the verb coloured by status. Newest at top, entering with `translateY(-4px)` + fade over 200ms. Max 8 rows, `overflow: hidden`, bottom fade via `mask-image`.

Derived purely from sorting the graph by `updatedAt` — roughly 40 lines, and it gives judges something to watch while the presenter talks.

### 6.9 `Legend`

Bottom-left, 24px from both edges. L1 pill, radius 10, padding 12, 11px text, five status dots. Toggled by `?`.

---

## 7. The other two pages

### 7.1 `/signals` — the end of the story

Centred at 820px, 32px top padding.

Title `h2`: **"What Athena noticed on its own"**.
Subtitle, 15px `TEXT_DIM`: **"Nobody reported any of this."**

That subtitle is the pitch line, printed on the screen. When the presenter says it, the judges are already reading it — repetition across two channels is how a line lands.

Cards stacked, 12px gap. Each: 3px severity rail (`blocked` / `at_risk` / `not_started`), eyebrow with severity and type, title at 18px `row`, one plain-English `why` sentence at 15px `TEXT_DIM`, then a row of node chips. Contradiction entries expand into the §6.3 quote block. A `Show in graph` text button calls `setHighlight(nodeIds)` and routes to `/`.

### 7.2 `/import` — where Generality is earned

Centred at 760px.

Title: **"Paste anything."** Subtitle: **"Athena turns it into graph."**

Example chips: `Meeting notes` · `PR description` · `Spec excerpt` · `Slack export`. 32px tall, radius 8, 1px `BORDER`, hover border `ACCENT`. Each fills the textarea with a canned sample.

They cost nothing and do three jobs: they demonstrate "any content type" against the brief's list, they remove live typing from the demo, and they give the presenter a one-click beat.

Textarea: min-height 320, L1, 1px `BORDER`, radius 12, padding 20, JetBrains Mono 14/22. Focus ring `ACCENT`/40%. Drag-over → dashed `ACCENT` border, `ACCENT`/5% fill.

Submit: 44px, `ACCENT` fill, 15px Inter 600, radius 8. In flight it reads `Athena is reading…` above a 2px indeterminate bar. **No fake step-by-step progress** — invented progress that claims specific work is a small lie, and the indeterminate bar communicates the same thing honestly.

Receipt:

```
┌──────────────────────────────────────────────────┐
│ APPLIED · 4 nodes · 6 edges                      │
│                                                  │
│ + Task     retention-window-review    [DOC]      │  + in done green
│ + Blocker  legal-signoff-pending      [DOC]      │
│ ~ Team     Legal · summary updated    [DOC]      │  ~ in in_progress blue
│                                                  │
│              [ See it in the graph → ]           │
└──────────────────────────────────────────────────┘
```

That button routes home, sets the highlight, and pans the graph. A form turns into a demo beat.

---

## 8. Accessibility — cheap, and all of it is sayable to judges

- **Focus ring:** `outline: 2px solid var(--accent-text); outline-offset: 2px`. Never `outline: none`.
- **Drawer:** `role="complementary"`, `aria-label="Team detail"`, `Esc` closes, focus moves to the panel heading on open and returns to the canvas on close.
- **Keyboard:** `g` `s` `i` navigate · `Esc` closes · `?` toggles the legend · `↑`/`↓` move through task rows.
- **Contrast:** every content colour measured in §2.2. Nothing under 4.5:1 carries meaning.
- **Colour-blind safe:** status is colour *plus* glyph everywhere.
- **Reduced motion:** honoured globally.

---

## 9. Projector pass — Saturday morning, 20 minutes

- [ ] Resize the browser to **1280 × 720** and read the screen from four metres. Anything unreadable gets cut, not shrunk.
- [ ] Set browser zoom to **110–125%** for the demo — a whole size step with no redesign work.
- [ ] Check on the actual projector if one is available: greens wash out, thin hairlines vanish, `#000` turns grey.
- [ ] Confirm no large gradients — they band visibly.
- [ ] Confirm the change-flash is visible from the back row. If it is not, raise it from 18% to 26% alpha.
- [ ] Confirm the top-bar heartbeat is visible when nothing else is moving.
- [ ] Full run with `?mock=1` — the whole app must work with the backend switched off.

---

## 10. First 10 seconds

Before a single word is spoken, the screen shows: a dark graph with glowing nodes, a wordmark with a one-line explanation of what this is, a live heartbeat in the corner, and a right-hand panel already showing four numbers and a red contradiction card.

A judge who hears nothing still learns: *it is a graph of a project, it is live, and something is wrong in Engineering.*

That is the whole design brief, compressed.
