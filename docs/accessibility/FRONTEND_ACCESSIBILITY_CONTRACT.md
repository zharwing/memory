# Frontend accessibility and responsive contract

Status: source implementation complete for MEM-FEV2-06; manual assistive-device qualification is deliberately not claimed here.

## Supported boundary

The desktop/browser interface is English and left-to-right. `index.html`
declares `lang="en"` and `dir="ltr"`. `apps/desktop/src/utils/format.ts` is the
only locale, date/time, relative-time, number, and percentage presentation
owner. Stored timestamps remain stable ISO instants. Invalid dates render owned
fallback copy rather than storage text.

The packaged Tauri window retains its 980 by 720 minimum. The browser surface
supports reflow at 390, 820, 980, and 1440 CSS pixels and at 200 percent zoom.
Navigation, recovery, and destructive controls remain reachable at every
width. Dense tables, diagrams, and visual graphs use contained scrolling; their
nonvisual information must remain available without interpreting position or
color.

## Theme and visual semantics

`packages/theme` owns registered roles for backgrounds, surfaces, overlays,
text, borders, accent, danger, success, warning, information, focus, spacing,
type, radius, elevation, layers, and motion. The desktop mirrors those values
in `00-semantic-tokens.css`, which loads before first paint. System color scheme
is the default; an explicit `data-theme` may override it without constructing a
stylesheet at runtime.

Every registered text/background pair must meet WCAG 2.2 AA (4.5:1 for normal
text). Visualization colors are a separate documented palette and never stand
in for a status label. Component CSS consumes semantic variables; foregrounds
are not selected ad hoc for semantic backgrounds.

Visible focus is required. Forced-colors mode preserves native colors and
selection borders. Reduced-motion mode removes nonessential transitions and
continuous spinners. Hover is an enhancement, never the only indication or
activation path. Coarse-pointer controls have at least a 44 CSS-pixel target.

## Component contracts

- `Dialog` portals outside the inert application root, isolates nested dialogs,
  owns initial focus and Tab containment, lets only the top dialog handle
  Escape/backdrop dismissal, and restores focus to the opener. Destructive
  dialogs default to the least-destructive action.
- `Field`, `TextField`, and `SelectField` provide visible labels and linked help
  and error text. `ErrorSummary` is announced and focused deterministically.
  Values remain present after validation, refusal, or an unknown outcome.
- `ToggleGroup` exposes pressed, radio, or tab state. Composite variants own
  Arrow, Home, End, and roving-focus behavior.
- `IconButton` requires an accessible name and supplies an adequate target.
- `StatusNotice` separates polite status from assertive failure.
- `AsyncRegion` distinguishes initial loading, refresh, partial, stale, empty,
  failure, and outcome-unknown states. Refresh and ambiguity retain known-good
  content; an initial load never flashes empty-state copy.
- `Progress` uses `progressbar` only when value and maximum are known. Unknown
  work is described as activity, not fake measured progress.
- `VisuallyHidden` provides names and instructions without visual duplication.

Route content has one `h1`; the shell provides a skip link and one main
landmark. Clickable table rows are keyboard-operable. Permanent actions always
confirm and cannot store a "do not ask again" preference.

## Reproducible local checks

Run the source contract only during the final integrated qualification pass:

```text
node scripts/check-frontend-accessibility.mjs
```

It checks the English/LTR declaration, static token load order, token
completeness, both themes' registered contrast pairs, positive tab indexes,
focus suppression, raw component colors, unmanaged icon-only controls, fake
progress bars, and formatter bypasses.

At final qualification, exercise keyboard-only journeys at each reference
width and 200 percent zoom: create/select a project, link a repo, preview an
import, edit a document, close a session, and cancel/confirm each destructive
dialog. Verify focus entry/containment/return, error-summary focus, retained
values, no clipped actions, and no pointer-only behavior. Repeat with reduced
motion and Windows forced colors.

NVDA plus Edge, the packaged WebView, touch/coarse-pointer hardware, and a
physical small-screen browser are `deferred_platform_validation` until actually
observed. Static checks or emulation must never be reported as those manual
passes.
