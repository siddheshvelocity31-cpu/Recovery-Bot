# Design System — Receivables Recovery System

*Derived from VSAR Technologies brand design language (vsartech.com)*

---

## Product Context

- **What this is:** Internal receivables recovery tool for VSAR Technologies — imports client ledgers, derives open items and aging, runs configurable dunning cadence over WhatsApp/email/voice, captures replies and promises-to-pay, maintains append-only audit trail per client.
- **Who it's for:** VSAR accounts/collections team (collectors, admins, viewers)
- **Space/industry:** B2B travel technology, corporate receivables automation
- **Project type:** Data-dense internal web app / dashboard (App UI rules apply)

---

## Aesthetic Direction

- **Direction:** Industrial/Utilitarian — Function-first, data-dense, monospace accents, muted palette
- **Decoration level:** Minimal — Typography and structure do the work; no decorative gradients, blobs, or illustrations
- **Mood:** Precision engineering. Sharp, technical, authoritative. Trust through clarity and density.
- **Reference:** vsartech.com (brand site), Linear.app, Vercel, Stripe technical aesthetic

---

## Typography

**Font Stack (Google Fonts / self-hosted via next/font):**

| Role | Font | CSS Variable | Rationale |
|------|------|--------------|-----------|
| **Display/Serif** | Fraunces | `--font-serif` | Authority, permanence for page titles, key metrics |
| **Body/UI** | Inter | `--font-sans` | Default UI font — clean, readable at density |
| **Data/Technical** | Geist Mono | `--font-mono` | All money (paise), dates, IDs, status codes, technical labels |

**Scale (modular, 1.25 major third):**

| Token | Size (rem) | Size (px) | Weight | Tracking | Usage |
|-------|------------|-----------|--------|----------|-------|
| `--text-display` | 3.5rem | 56px | 500 (serif) | -0.02em | Page hero titles |
| `--text-h1` | 2.25rem | 36px | 400 (serif) | -0.02em | Major section headers |
| `--text-h2` | 1.5rem | 24px | 700 (sans) | tight | Card titles, table headers |
| `--text-h3` | 1.125rem | 18px | 700 (sans) | tight | Sub-section headers |
| `--text-body` | 0.875rem | 14px | 400 (sans) | normal | Body copy, table cells |
| `--text-body-sm` | 0.8125rem | 13px | 400 (sans) | normal | Dense table cells, metadata |
| `--text-label` | 0.6875rem | 11px | 600 (sans) | 0.2em uppercase | Nav, badges, column headers |
| `--text-mono` | 0.75rem | 12px | 500 (mono) | normal | Money, dates, IDs, codes |
| `--text-mono-sm` | 0.625rem | 10px | 700 (mono) | normal | Compact technical labels |

**Text Colors (CSS Custom Properties):**

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-text-primary` | `#171717` (neutral-950) | `#fafafa` (neutral-50) | Primary headings, body |
| `--color-text-secondary` | `#525252` (neutral-600) | `#a3a3a3` (neutral-400) | Metadata, descriptions |
| `--color-text-muted` | `#737373` (neutral-500) | `#737373` (neutral-500) | Placeholders, disabled |
| `--color-text-inverse` | `#fafafa` | `#171717` | On dark buttons, dark cards |
| `--color-text-accent` | `#10b981` (emerald-500) | `#10b981` | Success, kept promises |
| `--color-text-warning` | `#f59e0b` (amber-500) | `#f59e0b` | Warnings, partial |
| `--color-text-error` | `#ef4444` (red-500) | `#ef4444` | Errors, broken promises |
| `--color-text-info` | `#06b6d4` (cyan-500) | `#06b6d4` | Info, AI-extracted |

---

## Color

**Approach:** Restrained — 1 accent (emerald) + neutrals; color is rare and meaningful. Semantic colors only for state communication.

**Neutral Palette (Tailwind `neutral` scale):**

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-neutral-50` | `#fafafa` | — | Hover backgrounds |
| `--color-neutral-100` | `#f5f5f5` | — | Card backgrounds, dividers |
| `--color-neutral-200` | `#e5e7eb` | — | Borders, dividers |
| `--color-neutral-300` | `#d4d4d4` | — | Disabled borders |
| `--color-neutral-400` | `#a3a3a3` | `#a3a3a3` | Placeholders, secondary labels |
| `--color-neutral-500` | `#737373` | `#737373` | Muted text |
| `--color-neutral-600` | `#525252` | — | Body copy (light) |
| `--color-neutral-700` | `#404040` | — | Darker body |
| `--color-neutral-800` | `#262626` | — | — |
| `--color-neutral-900` | `#171717` | — | Primary text (light) |
| `--color-neutral-950` | `#0a0a0a` | — | Darkest text (light) |
| `--color-surface` | `#ffffff` | `#090a0c` | Page/card backgrounds |
| `--color-surface-elevated` | `#ffffff` | `#0f172a` | Modals, dropdowns, diagrams |
| `--color-border` | `#e5e7eb` | `rgba(255,255,255,0.15)` | Default borders |
| `--color-border-strong` | `#d4d4d4` | `rgba(255,255,255,0.20)` | Emphasized borders |

**Semantic Colors (exact values — do not adjust):**

| Token | Hex | Light Usage | Dark Usage |
|-------|-----|-------------|------------|
| `--color-success` | `#10b981` | `text-emerald-600` / `bg-emerald-50` | `text-emerald-400` / `bg-emerald-900/20` |
| `--color-warning` | `#f59e0b` | `text-amber-600` / `bg-amber-50` | `text-amber-400` / `bg-amber-900/20` |
| `--color-error` | `#ef4444` | `text-red-600` / `bg-red-50` | `text-red-400` / `bg-red-900/20` |
| `--color-info` | `#06b6d4` | `text-cyan-600` / `bg-cyan-50` | `text-cyan-400` / `bg-cyan-900/20` |
| `--color-purple` | `#a855f7` | `text-purple-600` / `bg-purple-50` | `text-purple-400` / `bg-purple-900/20` |

**Dark Mode Strategy:**
- Surfaces use elevation: base `#090a0c`, elevated `#0f172a`
- Text: off-white (`#fafafa`) not pure white
- Borders: `rgba(255,255,255,0.15)` primary, `rgba(255,255,255,0.20)` strong
- Accent saturation reduced 10-15% in dark mode (handled by opacity overlays)
- `color-scheme: dark` on `<html>` when dark class active

---

## Spacing

- **Base unit:** 4px (Tailwind default)
- **Density:** Comfortable — data-dense but readable; 8px (2) base rhythm

**Scale:**

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--space-1` | 0.25rem | 4px | Icon gaps, tight padding |
| `--space-2` | 0.5rem | 8px | Standard gaps, button padding Y |
| `--space-3` | 0.75rem | 12px | Card padding, form gaps |
| `--space-4` | 1rem | 16px | Container padding (mobile) |
| `--space-5` | 1.25rem | 20px | Section vertical rhythm |
| `--space-6` | 1.5rem | 24px | Card padding (desktop), large gaps |
| `--space-8` | 2rem | 32px | Section padding |
| `--space-10` | 2.5rem | 40px | Container padding (tablet) |
| `--space-12` | 3rem | 48px | Container padding (desktop) |
| `--space-14` | 3.5rem | 56px | Large section padding |
| `--space-20` | 5rem | 80px | Hero vertical spacing |

---

## Layout

- **Approach:** Grid-disciplined — strict columns, predictable alignment
- **Grid:** 12-column on desktop (`lg:grid-cols-12`), responsive `1 → 2 → 4 → 12`
- **Max content width:** `--container-max: 1408px` (`max-w-8xl`)
- **Container pattern:** `<div class="max-w-8xl mx-auto px-4 sm:px-6 lg:px-12">`
- **Section rhythm:** Alternating light/dark bands for long pages
- **Header:** Sticky, `max-w-8xl` container, logo left, nav center, actions right

---

## Border Radius

**Hierarchical scale (sharp/technical — no bubbly radii):**

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0 | Full-width banners, table cells |
| `--radius-hairline` | 1px | Status indicator dots |
| `--radius-sm` | 2px | Buttons, cards, inputs, dropdowns, diagram nodes |
| `--radius-md` | 3px | Chat bubbles, progress bars |
| `--radius-lg` | 4px | Logo badges, larger containers |
| `--radius-full` | 9999px | Progress fills, pulse dots, pills, avatars |

---

## Motion

- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** `ease-out` enter, `ease-in` exit, `ease-in-out` move (default `ease` = `ease-in-out`)
- **Durations:**
  - Micro: 75ms (press feedback, arrow bounce)
  - Short: 200ms (hover, color, opacity, transform)
  - Medium: 300ms (panel crossfade, dropdown, theme toggle)
  - Long: 500ms (diagram panel transitions)

**Key Patterns:**
- Buttons: `transition-all duration-200 active:scale-[0.98]`
- Cards: `transition-colors duration-200`
- Nav/links: `transition-colors duration-300`
- Arrows: `group-hover:translate-x-1 transition-transform duration-200`
- Progress bars: `transition-all duration-300 ease-out`
- Crossfade panels: `transition-opacity duration-500`
- Scroll-driven: `will-change-transform` + sticky positioning

**Reduced Motion:** Respect `prefers-reduced-motion: reduce` — disable non-essential animations.

---

## Component Patterns

### Buttons

| Variant | Light | Dark | States |
|---------|-------|------|--------|
| **Primary** | `bg-white text-neutral-950 shadow-lg shadow-white/10` | `bg-neutral-950 text-white shadow-xl` | `hover:bg-neutral-200` / `hover:bg-neutral-800`, `active:scale-[0.98]` |
| **Secondary** | `bg-neutral-100 text-neutral-900` | `bg-neutral-800 text-neutral-100` | `hover:bg-neutral-200` / `hover:bg-neutral-700` |
| **Ghost** | `text-neutral-600 hover:text-neutral-900` | `text-neutral-400 hover:text-white` | `transition-colors duration-300` |
| **Destructive** | `bg-red-50 text-red-600` | `bg-red-900/20 text-red-400` | `hover:bg-red-100` / `hover:bg-red-900/30` |

**Sizes:**
- `--btn-sm`: `px-3 py-1.5 text-xs` (label size)
- `--btn-md`: `px-4 py-2 text-sm` (default)
- `--btn-lg`: `px-6 py-3 text-base` (hero CTAs)

### Badges / Pills

- Radius: `--radius-full` (9999px)
- Padding: `px-2 py-0.5` (sm), `px-2.5 py-0.5` (md)
- Font: `--text-label` (11px, 600, uppercase, tracking-wide)
- Variants use semantic colors with 10% bg / 60% text opacity

### Cards

- Background: `bg-white` / `bg-[#090a0c]`
- Border: `border border-[#e5e7eb]` / `border border-white/15`
- Radius: `--radius-sm` (2px)
- Padding: `p-4 sm:p-6`
- Hover: `hover:bg-neutral-50/30` (subtle)

### Tables

- Header: `bg-neutral-50` / `bg-neutral-900/50`, `--text-label`, uppercase
- Row hover: `hover:bg-neutral-50/50` / `hover:bg-white/5`
- Divider: `divide-y divide-neutral-200` / `divide-white/10`
- Money: `--text-mono` + `tabular-nums`, right-aligned
- Status: Badge with semantic colors

### Inputs

- Background: `bg-white` / `bg-neutral-800`
- Border: `border border-neutral-300` / `border border-white/20`
- Focus: `focus:border-neutral-950` / `focus:border-white`, `focus:ring-1 focus:ring-neutral-950` / `focus:ring-white`
- Radius: `--radius-sm` (2px)
- Padding: `px-3 py-2`
- Font: `--text-body`

### Progress Bars

- Height: 3px (`h-[3px]`)
- Radius: `--radius-full`
- Track: `bg-neutral-100` / `bg-white/20`
- Fill: `bg-neutral-950` / `bg-white`
- Transition: `transition-all duration-300 ease-out`

---

## Iconography

- **Library:** Lucide React (already in deps)
- **Size:** 12px (inline), 16px (UI), 20px (header), 24px (feature)
- **Stroke:** 2px default, 1.5px for small
- **Style:** Outlined, sharp corners — matches 2px radius language

---

## Accessibility

- **Contrast:** WCAG AA minimum (4.5:1 body, 3:1 large text/UI)
- **Focus Visible:** All interactive elements have `focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2` (light) / `focus-visible:ring-white` (dark)
- **Touch Targets:** Minimum 44px (48px preferred) on mobile
- **Color Independence:** Never color-only — always with label/icon/pattern
- **Reduced Motion:** Respect `prefers-reduced-motion`

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-30 | Adopt VSAR brand design system for internal tool | Consistency with external brand; "precision engineering" aesthetic matches receivables domain |
| 2026-08-30 | Fraunces for display, Inter for body, Geist Mono for data | Three-font hierarchy matches vsartech.com; mono critical for money/IDs |
| 2026-08-30 | Restrained color (emerald only accent) | Internal tool — color for state only, not decoration |
| 2026-08-30 | 2px border radius globally | Sharp/technical feel per vsartech.com; no bubbly SaaS look |
| 2026-08-30 | Alternating light/dark section bands | Creates rhythm on long scroll pages (client detail, alert board) |
| 2026-08-30 | 200-300ms transitions on all interactive | Per vsartech.com motion spec; feels precise not snappy |
| 2026-08-30 | Table money right-aligned, tabular-nums, Geist Mono | Money is BIGINT paise — mono ensures digit alignment |