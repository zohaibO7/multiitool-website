# MultiTool

58 small utilities — text tools, generators, calculators, converters, image and PDF tools,
developer tools — in one static website. Everything runs in the visitor's browser. There is no
backend, no build step, no framework, and no tracking.

Built from `multitool-website-structure.pdf`, which is the specification of record for this
project.

---

## Running it locally

There is nothing to install and nothing to compile.

1. Open the `multitool-website` folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) if you do not already have it.
3. Right-click `index.html` → **Open with Live Server**.

Live Server is the recommended way to preview because it serves the site over `http://localhost`.
That matters for two features: the clipboard API and, later, anything reading files. Opening
`index.html` directly off the file system mostly works — `common.js` falls back to an older copy
method in that case — but localhost is the closer match to production.

## Project structure

```
multitool-website/
├── index.html            Homepage: hero, search, category-wise tool grid
├── README.md             This file
├── assets/
│   ├── css/
│   │   ├── style.css     Design tokens, reset, navbar, footer, card grid, buttons
│   │   └── tool.css      Shared tool-page shell: panels, inputs, outputs, stats
│   ├── js/
│   │   ├── common.js     Theme, injected navbar/footer, shared helpers (all pages)
│   │   └── main.js       Homepage search and category filtering
│   ├── images/           Raster assets
│   └── icons/            favicon.svg
└── tools/
    └── <tool-slug>/
        ├── index.html    The tool's page
        └── script.js     The tool's logic
```

Shared code lives in `assets/` and nowhere else. A tool folder contains exactly two files.

## Tool inventory

| Category | Tools | Cost |
|---|---|---|
| Text Tools | 10 | Free |
| Generators | 10 | Free |
| Calculators | 10 | Free |
| Converters | 7 | Free |
| Image Tools | 4 | Free |
| PDF Tools | 2 | Free |
| Developer Tools | 10 | Free |
| Fun / Utility Tools | 5 | Free |
| **Total** | **58** | **Free** |

Category names, counts and folder slugs come from the specification and must not be changed
without changing it too.

### Folder slugs, by category

Transcribed from the specification. The grouping is the specification's, not an obvious one —
`lorem-ipsum-generator` is a Text Tool, `password-strength-checker` is a Generator, and
`ascii-art-generator` is a Converter. Do not regroup them.

**Text Tools (10)** — `word-counter`, `case-converter`, `text-reverser`,
`duplicate-line-remover`, `lorem-ipsum-generator`, `text-to-speech`, `word-frequency-counter`,
`text-diff-checker`, `palindrome-checker`, `text-sorter`

**Generators (10)** — `qr-generator`, `password-generator`, `uuid-generator`,
`barcode-generator`, `random-number-generator`, `fake-name-generator`,
`password-strength-checker`, `coin-flip-dice-roller`, `username-generator`, `slug-generator`

**Calculators (10)** — `age-calculator`, `percentage-calculator`, `bmi-calculator`,
`loan-emi-calculator`, `gpa-calculator`, `interest-calculator`, `tip-calculator`,
`discount-calculator`, `date-difference-calculator`, `timezone-meeting-planner`

**Converters (7)** — `unit-converter`, `color-converter`, `timezone-converter`,
`number-to-words`, `roman-numeral-converter`, `binary-hex-octal-converter`,
`ascii-art-generator`

**Image Tools (4)** — `image-compressor`, `image-resizer`, `image-format-converter`,
`meme-generator`

**PDF Tools (2)** — `image-to-pdf`, `pdf-merge-split`

**Developer Tools (10)** — `json-formatter`, `base64-encoder-decoder`, `regex-tester`,
`markdown-to-html`, `code-minifier`, `css-gradient-generator`, `box-shadow-generator`,
`html-entity-encoder-decoder`, `cron-expression-generator`, `placeholder-image-generator`

**Fun / Utility Tools (5)** — `typing-speed-test`, `countdown-timer`, `stopwatch`,
`random-quote-generator`, `random-team-picker`

Tool titles, one-line descriptions and card icons are not specified in the PDF; those were
written for this build and can be reworded freely. The slugs and the grouping cannot.

## The tool directory

The homepage is the directory — the specification puts all 58 links in `index.html` in a
category-wise grid rather than on a separate page, so there is no second listing to keep in sync.
`assets/js/main.js` drives it.

Every card is a plain `<a>` in the HTML. Search, filtering and sorting are enhancements layered on
top, so the full directory still works with JavaScript disabled.

**Search** matches against the tool name, its `data-keywords`, and its category label. Multiple
words are ANDed and order does not matter, so "qr code" and "code qr" return the same result. The
matched run is highlighted inside the card title and description.

**Sorting** by name dissolves the category grouping: all cards move into a single flat grid
(`#flat-results`) and the eight category sections are hidden. Switching back to "By category"
returns every card to its original section in its original order.

**URL state** — search, category and sort are reflected in the query string so a filtered view can
be shared or bookmarked:

```
index.html?q=json
index.html?cat=developer-tools
index.html?q=image&cat=image-tools&sort=az
index.html#cat-generators        also supported; this is what the footer links use
```

These are written with `history.replaceState`, so typing does not fill the back button with an
entry per keystroke. The trade-off is that Back leaves the page instead of stepping backwards
through filters, which is the less surprising of the two behaviours. The chosen sort is also
remembered in `localStorage` under `multitool-sort`; an explicit `?sort=` in the URL overrides it
so a shared link shows what the sender saw.

**Keyboard** — `/` focuses search from anywhere. From the search box, `Enter` opens the first
result and `↓` moves focus into the grid. Within the grid, arrow keys move between cards,
`Home`/`End` jump to the first/last, and `Escape` returns to search. The grid is treated as a
one-dimensional list because `auto-fit` means the column count changes with the viewport, so true
two-dimensional arrow movement would be unpredictable.

Search-match highlighting escapes every slice of the original text through `MT.escapeHtml` and only
ever injects literal `<mark>` tags. It deliberately does not escape first and then run the regex,
because escaping would turn `&` into `&amp;` and a search for "amp" would match inside the entity
and produce broken markup.

## Adding a tool page

Every tool page follows the same contract. Copy `tools/word-counter/` and adapt it — it is the
reference implementation.

```html
<html lang="en" data-base="../../">
```

`data-base` is how `common.js` works out the path back to the site root. It is `""` on the
homepage and `"../../"` for any page inside `tools/<slug>/`. Get this wrong and the navbar links
and logo break.

A tool page must include:

- the inline theme snippet in `<head>` (prevents a white flash in dark mode)
- `../../assets/css/style.css` then `../../assets/css/tool.css`, in that order
- `<header class="site-header" id="site-header"></header>` — navbar injects here
- `<main class="site-main" id="main">` — the skip link targets this
- `<footer class="site-footer" id="site-footer"></footer>` — footer injects here
- `../../assets/js/common.js` with `defer`, then `script.js` with `defer`

Do not add a `<nav>` or footer markup by hand, and do not restyle buttons, inputs or panels
locally. Use the classes in `tool.css`. If a tool genuinely needs something one-off, put it in a
`<style>` block on that page only.

### What `script.js` must look like

`tools/word-counter/script.js` sets the pattern. Its header comment lists the rules; the ones
worth repeating here:

- Everything goes inside an IIFE. Nothing is added to `window`.
- Return early if `MT` is undefined, rather than throwing — a missing `common.js` should degrade,
  not blank the page.
- The tool's actual logic lives in **pure functions at the top**, with no DOM access. All DOM
  work happens inside `MT.ready()` at the bottom. This is what makes the logic readable and
  reviewable in isolation.
- User input never reaches `innerHTML`. Use `textContent`, or `MT.escapeHtml` first.
- Reuse `MT` helpers instead of reimplementing them.
- **Keep the file pure ASCII.** A `<script src>` carries no charset of its own, so it inherits
  the document's encoding. A regex full of literal CJK characters or curly quotes would depend
  on that never going wrong, and if it did the character class would silently stop matching
  instead of failing loudly. Build any non-ASCII character from its code point — Word Counter has
  small `range(from, to)` and `chars(...)` helpers for exactly this.
- ES5 only: no `let`/`const`, arrow functions, template literals or `\p{...}` regex escapes.
  There is no transpiler. `\p{L}` in particular needs the `/u` flag, and a regex the engine
  cannot parse is a `SyntaxError` that takes the whole file down.

### Persistence keys

A tool that remembers state uses `MT.store` (a `localStorage` wrapper that cannot throw) with a
key namespaced to the tool:

| Key | Holds |
|---|---|
| `multitool-theme` | Site-wide dark/light preference |
| `multitool-sort` | Homepage directory sort order |
| `multitool-word-counter-text` | The text left in the Word Counter |
| `multitool-word-counter-wpm` | The chosen reading speed |
| `multitool-case-converter-text` / `-mode` | Text and the chosen case style |
| `multitool-text-reverser-text` / `-mode` | Text and what to reverse |
| `multitool-duplicate-line-remover-text` / `-mode` / `-options` | List, what to keep, the four checkboxes |
| `multitool-lorem-ipsum-generator-unit` / `-count` / `-options` | Paragraphs/sentences/words, how many, the generator's options |
| `multitool-text-to-speech-text` / `-voice` / `-rate` / `-pitch` / `-volume` | Script and voice settings |
| `multitool-word-frequency-counter-text` / `-mode` / `-options` / `-min-length` / `-top` | Text, single/pairs/triples, filters, row limit |
| `multitool-text-diff-checker-a` / `-b` / `-view` / `-options` | Both texts, split vs unified, the five checkboxes |
| `multitool-text-sorter-text` / `-mode` / `-options` | List, sort order, the four checkboxes |
| `multitool-palindrome-checker-text` / `-options` | Text and the comparison rules |

Anything restored from a previous visit must be visible as such — Word Counter shows a dismissible
`.tool-alert--info` notice and its Clear button removes the stored copy.

Option checkboxes are persisted as a fixed-length string of `'1'`/`'0'` characters, one per box, in
the order the boxes are declared in the script. That is deliberately not JSON: it cannot throw on
parse, it stays readable in devtools, and adding a box at the end of the list keeps old saved values
valid.

## Shared helpers

`common.js` exposes one global, `MT`:

| Helper | What it does |
|---|---|
| `MT.url(path)` | Rewrites a root-relative path for the current page depth |
| `MT.$(sel)` / `MT.$$(sel)` | `querySelector` / `querySelectorAll` returning a real array |
| `MT.ready(fn)` | Runs `fn` once the DOM is parsed |
| `MT.toast(msg, type)` | Transient confirmation; type is `info`, `success` or `error` |
| `MT.copyWithFeedback(text)` | Copies and shows the right toast either way |
| `MT.downloadText(text, name)` | Saves a string as a file |
| `MT.downloadBlob(blob, name)` | Saves a Blob as a file |
| `MT.readFileAsText/DataURL/ArrayBuffer(file)` | Promise-based local file reading |
| `MT.escapeHtml(s)` | Escapes text bound for `innerHTML` |
| `MT.formatNumber(n)` / `MT.formatBytes(n)` | `1,234` / `1.5 KB` |
| `MT.debounce(fn, ms)` | Waits for typing to settle |
| `MT.slugify(s)` / `MT.clamp(v,min,max)` | Small utilities |
| `MT.stableSort(arr, cmp)` | Sort that preserves the original order of equal items |
| `MT.compareText(a, b)` | Locale-aware string comparison, used by every A–Z sort |
| `MT.categoryById(id)` | Category metadata lookup |
| `MT.CATEGORIES` / `MT.TOOL_COUNT` | Category metadata; `58` |
| `MT.toggleTheme()` / `MT.currentTheme()` | Dark mode |
| `MT.store.get/set` | `localStorage` that cannot throw |

Prefer `textContent` over `innerHTML` for anything a visitor typed. Where `innerHTML` is
unavoidable, run the value through `MT.escapeHtml` first.

## Shared tool-page components

These live in `tool.css` and are used by several tools. Add to them rather than restyling locally.

**`.mode-group`** — the row of mode buttons most tools use to pick a variant (case style, sort
order, what to reverse). The buttons are never written by hand in HTML; each `script.js` declares
one array of `{ id, label, eg }` and builds them, so a label, its example text and its conversion
function cannot drift apart. `aria-pressed` is the single source of truth for which is active, and
clicks are handled by one delegated listener that walks up from `event.target` looking for a
`data-mode` attribute.

**`.data-table` inside `.table-wrap`** — the scrollable results table used by Word Frequency
Counter and Text Diff Checker. `.table-wrap` carries `tabindex="0"` so a keyboard user can scroll
it, and `aria-labelledby` pointing at a visible label.

Two specificity traps in this component, both found the hard way:

- `.data-table td` sets `text-align: left`, which is specificity 0,1,1. A bare cell modifier such
  as `.data-table__num` is 0,1,0 and silently loses. Any cell modifier that changes alignment must
  be written scoped — `.data-table .data-table__num` — or it does nothing at all.
- `.data-table tbody tr:hover` sets a background. A bare row modifier loses to it, so a row that
  is coloured to mean something (an added or removed diff line) needs its own
  `.data-table tbody tr.diff-row--add:hover` rule or the colour vanishes under the pointer.

**`[hidden]` and author-origin `display`** — the UA rule `[hidden] { display: none }` is
author-origin-beatable, so any component whose own CSS sets `display` needs an explicit
`.component[hidden] { display: none }`. That is why `tool.css` has `.btn[hidden]` and
`.tool-alert[hidden]` rules. `.table-wrap` and `.output` set no `display`, so plain `hidden` works
on them.

**Page-local styles** are the exception, not the rule. Two pages have a `<style>` block: Text to
Speech (its follow-along sentence list) and Text Diff Checker (whole-row diff colouring). Both are
one-page-only concerns; the ranked-table styling was promoted into `tool.css` instead because two
tools needed it.

## Previous / next navigation

Every tool page ends with a `.tool-nav` pair of links that walks the category in specification
order, so a visitor can move through a category without going back to the homepage. The first tool
in a category points back at the category anchor, and the last points forward to it. The Text Tools
chain is:

```
All Text Tools ← word-counter → case-converter → text-reverser → duplicate-line-remover
→ lorem-ipsum-generator → text-to-speech → word-frequency-counter → text-diff-checker
→ palindrome-checker → text-sorter → All Text Tools
```

Order follows the PDF's tool list, not alphabetical order. When adding a category, fix both ends of
every link — a chain with one stale `href` is easy to create and invisible until someone clicks it.

## Design system

Colours, type, spacing, radius, shadow and motion are all CSS custom properties declared at the
top of `style.css`, with a `[data-theme="dark"]` block overriding the values that change. Nothing
else in the project hardcodes a colour — that is what makes one toggle restyle all 59 pages.

Brand values from the specification: navbar `#1e1e2f`, accent `#4a4ae0`. In dark mode the accent
lifts to `#6d6df0` so it still passes contrast against a near-black background; the brand value is
untouched in light mode.

Breakpoints are `900px` (nav collapses) and `640px` (single-column grid, stacked buttons). The card
grid uses `repeat(auto-fit, minmax(250px, 1fr))`, so column count follows the viewport without
extra media queries.

Dark mode preference is stored under the `localStorage` key `multitool-theme`. With no stored
preference the site follows the operating system setting and keeps following it. The directory's
sort choice is stored under `multitool-sort`. Both reads and writes go through `MT.store`, which
swallows the exception private-browsing modes throw.

## Accessibility baseline

Every page ships with a skip link, a visible `:focus-visible` ring, semantic landmarks, labelled
form controls, `aria-live` on result areas, and a `prefers-reduced-motion` block that disables the
card hover transforms. Keep that baseline when adding tools.

One caveat on `aria-live`. A single output box can carry `aria-live="polite"` directly. A grid of
several figures must **not** — six numbers changing on every keystroke floods a screen reader with
interruptions, which is worse than announcing nothing. Word Counter instead keeps a separate
`.visually-hidden` element with `role="status" aria-live="polite"` and writes one short debounced
sentence into it. Copy that pattern for any tool whose output updates as the user types.

## Browser support

Current Chrome, Edge, Firefox and Safari. The code uses CSS custom properties, CSS grid, and
ES5-compatible JavaScript with Promises. There is no transpiler, so avoid syntax older browsers
cannot parse.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 0 | Project structure and design system | Done |
| 1 | Homepage | Done |
| 2 | All-tools directory, search and filter | Done |
| 3 | Word Counter reference tool | Done |
| 4 | Text Tools (10) | Done |
| 5 | Generators | Not started |
| 6 | Calculators | Not started |
| 7 | Converters | Not started |
| 8 | Image and PDF Tools | Not started |
| 9 | Developer Tools | Not started |
| 10 | Fun / Utility Tools | Not started |
| 11 | UI/UX, responsive, accessibility, SEO, performance, security | Not started |
| 12 | Final release testing | Not started |

`index.html` lists all 58 tools as real links. Ten of them — the whole Text Tools category — are
built. The other 48 folders do not exist yet, so those links 404 until Phases 5–10 create them.
That is expected while building in phases: the directory is finished first, then filled in.

### Print

`.output--tall` and `.table-wrap` are set not to break across pages where the browser allows it, so
a printed result or a printed diff stays in one piece. Site chrome, mode buttons and action buttons
are hidden in the print stylesheet.
