# NFL Prop Matchup Dashboard — Developer Handoff

## Scope and current deployment

This repository contains the Field Note NFL Prop Matchup Dashboard. The deployed web artifact is:

- Artifact: `artifacts/nfl-prop-dashboard`
- Production URL: https://java-script-dashboard--petepastorino.replit.app/
- Current deployment type: Replit Autoscale with static artifact serving
- Deployment visibility: Public
- Deployment status at handoff preparation: deployed with a successful build

The dashboard is a client-side React/Vite application. It does not fetch player projections from an API at runtime. The API server and database packages remain in the workspace because this is a pnpm monorepo, but the dashboard does not import or call them.

## Repository structure

```text
.
├── HANDOFF.md
├── .env.example
├── .gitignore
├── .npmrc
├── .replit
├── .replitignore
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── replit.md
├── tsconfig.base.json
├── tsconfig.json
├── attached_assets/
│   └── 0_prop_matchup_dashboard_(1)_1789679044969.jsx
├── artifacts/
│   ├── nfl-prop-dashboard/                 # deployed web artifact
│   │   ├── .replit-artifact/artifact.toml  # artifact and deployment config
│   │   ├── components.json
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   └── robots.txt
│   │   ├── src/
│   │   │   ├── App.tsx                     # dashboard UI and derived calculations
│   │   │   ├── data/initial-prop-lines.ts  # preloaded sportsbook lines
│   │   │   ├── index.css                   # dashboard styling and responsive rules
│   │   │   ├── main.tsx                    # React entry point
│   │   │   ├── components/
│   │   │   │   └── error-boundary.tsx
│   │   │   ├── components/ui/              # shared Radix/shadcn-style UI components
│   │   │   │   ├── accordion.tsx
│   │   │   │   ├── alert-dialog.tsx
│   │   │   │   ├── alert.tsx
│   │   │   │   ├── aspect-ratio.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── breadcrumb.tsx
│   │   │   │   ├── button-group.tsx
│   │   │   │   ├── button.tsx
│   │   │   │   ├── calendar.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── carousel.tsx
│   │   │   │   ├── chart.tsx
│   │   │   │   ├── checkbox.tsx
│   │   │   │   ├── collapsible.tsx
│   │   │   │   ├── command.tsx
│   │   │   │   ├── context-menu.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── drawer.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── empty.tsx
│   │   │   │   ├── field.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── hover-card.tsx
│   │   │   │   ├── input-group.tsx
│   │   │   │   ├── input-otp.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── item.tsx
│   │   │   │   ├── kbd.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   ├── menubar.tsx
│   │   │   │   ├── navigation-menu.tsx
│   │   │   │   ├── pagination.tsx
│   │   │   │   ├── popover.tsx
│   │   │   │   ├── progress.tsx
│   │   │   │   ├── radio-group.tsx
│   │   │   │   ├── resizable.tsx
│   │   │   │   ├── scroll-area.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── sonner.tsx
│   │   │   │   ├── spinner.tsx
│   │   │   │   ├── switch.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   ├── toaster.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   ├── toggle-group.tsx
│   │   │   │   ├── toggle.tsx
│   │   │   │   └── tooltip.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-mobile.tsx
│   │   │   │   └── use-toast.ts
│   │   │   ├── lib/
│   │   │   │   └── utils.ts
│   │   │   └── pages/
│   │   │       └── not-found.tsx
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   ├── api-server/                          # workspace health/API service
│   │   ├── package.json
│   │   ├── src/routes/health.ts
│   │   ├── src/routes/index.ts
│   │   └── tsconfig.json
│   └── mockup-sandbox/                      # visual component preview artifact
├── lib/
│   ├── api-client-react/
│   ├── api-spec/
│   ├── api-zod/
│   └── db/
└── scripts/
    ├── package.json
    ├── post-merge.sh
    ├── src/hello.ts
    └── tsconfig.json
```

The `components/ui` directory contains the complete set of shared UI components currently present in the artifact. Most of them are template components; the dashboard's main screen is implemented in `src/App.tsx`.

## Install and run

### Prerequisites

- Node.js 24, matching the Replit project configuration
- pnpm

From the repository root:

```bash
pnpm install --frozen-lockfile
```

Run the dashboard development server:

```bash
PORT=20012 BASE_PATH=/ pnpm --filter @workspace/nfl-prop-dashboard run dev
```

The artifact configuration uses port `20012` and base path `/`. The Vite configuration requires both `PORT` and `BASE_PATH` even for a production build.

Run the dashboard typecheck:

```bash
pnpm --filter @workspace/nfl-prop-dashboard run typecheck
```

Build the dashboard:

```bash
PORT=20012 BASE_PATH=/ pnpm --filter @workspace/nfl-prop-dashboard run build
```

The build output is generated at `artifacts/nfl-prop-dashboard/dist/public/`. Build output is intentionally excluded from the handoff ZIP.

To preview an existing local build:

```bash
PORT=20012 BASE_PATH=/ pnpm --filter @workspace/nfl-prop-dashboard run serve
```

## Deployment

The dashboard's deployment configuration is in:

```text
artifacts/nfl-prop-dashboard/.replit-artifact/artifact.toml
```

Important production settings:

- Build command: `pnpm --filter @workspace/nfl-prop-dashboard run build`
- Serving mode: static
- Public directory: `artifacts/nfl-prop-dashboard/dist/public`
- SPA rewrite: all paths rewrite to `/index.html`
- Production `PORT`: `20012`
- Production `BASE_PATH`: `/`

The root `.replit` file selects the Autoscale deployment target. To publish a new version, use Replit's Publish flow; it runs the artifact's production build and serves the configured static directory. This handoff request did not redeploy the application.

The dashboard itself has no runtime API key, password, or secret requirement. The wider workspace's database package requires `DATABASE_URL` only if a developer runs database/API code or database tooling. See `.env.example`.

## Source of player data and projections

### Source file

The player dataset is embedded as the `const PLAYER_DATA = ...` JSON object in:

```text
attached_assets/0_prop_matchup_dashboard_(1)_1789679044969.jsx
```

The object is organized by top-level position keys:

```text
QB, RB, WR, TE
```

Each player record contains:

- `name`
- `team`
- `week2Opp`
- `isLowConfidence`
- `injuryStatus`
- `injury`
- `stats`

Each stat snapshot can contain:

- `projection`
- `lowConfidence`
- `nPriorGames`
- `priorAvg`
- `priorLast5`
- `matchupFactor`
- `isHome`
- `week1Actual`

There are no separate CSV, JSON, or defensive-data files for this dashboard. The matchup/defensive adjustment is represented by the precomputed `matchupFactor` stored inside each stat snapshot.

### How the app loads the data

`artifacts/nfl-prop-dashboard/src/App.tsx` imports the uploaded JSX file as raw text:

```ts
import sourceText from '@assets/0_prop_matchup_dashboard_(1)_1789679044969.jsx?raw';
```

`parsePlayerData()` extracts the text between `const PLAYER_DATA = ` and the following `;\n\nconst C` marker, then calls `JSON.parse`. The source asset must remain available at the same relative path and retain the expected marker format.

### Dynamic versus hard-coded projections

The numeric player projections are hard-coded data values in the uploaded asset. The deployed frontend does not calculate a new player projection from career average, last-five average, home/away status, team performance, or opponent data.

The original uploaded asset describes the projection as coming from a regression fit and cross-validated historical modeling, but the regression coefficients, training data, and fitting code are not included in this repository. Do not infer or recreate coefficients from the displayed values. Treat `projection` and `matchupFactor` as source data supplied to the frontend.

## Projection-related calculations currently used by the frontend

There is no frontend projection formula. The following are the complete derived calculations currently used after a sportsbook line is loaded.

### Edge, edge percentage, and lean

Implemented in `leanFromLine()` in `artifacts/nfl-prop-dashboard/src/App.tsx`:

```text
edge = projection - line
edgePct = line !== 0 ? edge / line : 0
```

Rules:

1. If the stat is missing, its projection is null, the line is empty, or the line is not numeric, the result is `—` with no edge.
2. If `abs(edgePct) < 0.04`, the result is `PASS` with `Low` line confidence.
3. Otherwise:
   - `projection > line` → `OVER`
   - `projection <= line` → `UNDER`
4. Line-confidence labels use strict thresholds:
   - `abs(edgePct) > 0.18` → `High`
   - `abs(edgePct) > 0.09` → `Medium`
   - otherwise → `Low`

The over/under word pasted by a user is not used to override this calculation. Only the numeric line is used.

### Confidence board score

Implemented in `getConfidence()` in `App.tsx`. Only entered lines with a non-null projection become ranked props.

```text
edgeScore = min(abs(edgePct) * 100, 32)
historyScore = min(nPriorGames / 50, 1) * 42
limitedHistoryPenalty = player.isLowConfidence ? 18 : 0
injuryPenalty = player.injuryStatus ? 10 : 0

confidenceScore =
  max(
    0,
    min(
      100,
      round(edgeScore + historyScore + 26
            - limitedHistoryPenalty
            - injuryPenalty)
    )
  )
```

Score labels:

- `confidenceScore >= 72` → `High`
- `confidenceScore >= 48` → `Medium`
- otherwise → `Low`

If an edge cannot be calculated, the confidence score is `0` and the label is `Low`. The board sorts descending by score and displays at most the first 10 rows. A `PASS` lean is not removed from the board; it can still receive a score from the same formula.

### Detail-panel confidence display

The detail panel forces effective confidence to `Low` whenever `player.isLowConfidence` is true. Otherwise it uses the lean confidence returned by `leanFromLine()`. The visual meter widths are presentation values:

- High: `88%`
- Medium: `61%`
- Low: `34%`
- No confidence: `8%`

These meter widths do not change the score.

### Matchup factor and adjustments

`matchupFactor` is read from the hard-coded stat snapshot and displayed as a multiplier. The frontend does not multiply the projection by it and does not apply another matchup adjustment.

Display labels:

- missing factor → `No factor`
- `matchupFactor > 1.05` → `Favorable`
- `matchupFactor < 0.95` → `Difficult`
- otherwise → `Neutral`

`isHome` is displayed as Home/Away context but does not modify any frontend calculation. `priorAvg`, `priorLast5`, and `week1Actual` are displayed as comparison/context values and do not modify the projection or confidence score. Injury status contributes only the 10-point ranking penalty described above; it also displays an injury chip.

### Trend labels

`trendLabel()` and `trendDetail()` compare `priorLast5` to `priorAvg`:

```text
delta = priorLast5 - priorAvg
```

- Missing either value → `History unavailable`
- `abs(delta) < priorAvg * 0.04` → `Holding steady`
- Positive delta → `Trending up`
- Otherwise → `Trending down`

The trend is informational only and does not alter the projection, lean, or confidence score.

## Prop-line import and player matching

The import logic is in `parseBulkLines()` in `artifacts/nfl-prop-dashboard/src/App.tsx`.

### Accepted input

- One entry per line or semicolon-separated entries
- A player name plus an optional stat phrase plus a number
- Over/Under tokens are optional and ignored
- The last numeric token in the entry becomes the line:

```text
Puka Nacua rec yards 75.5
Josh Allen pass yards 245.5
```

The initially loaded lines are stored in `src/data/initial-prop-lines.ts`. The UI also allows new pasted lines to be applied at runtime.

### Player normalization

Player matching is case-insensitive and normalizes input by:

- converting to lowercase
- removing periods and apostrophes
- removing suffix tokens `jr`, `sr`, `ii`, `iii`, and `iv`
- replacing non-alphanumeric characters with spaces
- collapsing repeated spaces

The parser matches the longest player name first. It accepts either the normalized name as a substring or a compact comparison with spaces removed, which handles forms such as `C.J. Stroud` versus `CJ Stroud`.

### Stat normalization

The available categories are position-specific:

- QB: `pass_yards`, `rush_yards`
- RB: `rush_yards`, `rec_yards`, `receptions`
- WR: `rec_yards`, `receptions`
- TE: `rec_yards`, `receptions`

Aliases are defined in `STAT_ALIASES`:

- Passing yards: `passing yards`, `pass yards`, `pass yds`, `passing yds`, `pass yard`
- Rushing yards: `rushing yards`, `rush yards`, `rush yds`, `rushing yds`, `rush yard`
- Receiving yards: `receiving yards`, `rec yards`, `receiving yds`, `rec yds`, `rec yard`
- Receptions: `receptions`, `reception`, `catches`, `catch`, `rec pts`, `recpt`

When a heading such as `Receiving Yards` appears, it establishes the current stat category for following entries. The section category takes precedence over per-line matching, preventing receiving-yards entries from being interpreted as receptions. When no section heading is active, the longest matching stat alias is selected.

### Validation and storage

An entry is rejected when:

- no player matches
- no stat category can be determined
- no numeric line is found
- the matched player has no projection for the selected stat

Accepted entries are stored under:

```text
position:statKey:canonical player name
```

The import parser does not persist changes to a server or database. Lines are held in React state for the current browser session. The preloaded initial lines are the only lines present after a fresh page load.

## Position, team, opponent, game, and stat handling

- Position is taken directly from the `PLAYER_DATA` top-level key: `QB`, `RB`, `WR`, or `TE`.
- Team and opponent values are stored as source strings such as `BUF` and `DET`; there is no league/team lookup or abbreviation conversion.
- The game filter creates a canonical key by alphabetically sorting `team` and `week2Opp`, then joining them with `|`. This makes both player perspectives of the same matchup share one filter option. The displayed game label uses `TEAM vs OPP`.
- The selected player's `isHome` value remains directional in the detail view and player row.
- Stat keys are the exact frontend keys listed above; labels are presentation labels such as `Pass Yards`, `Rush Yards`, `Rec Yards`, and `Receptions`.

## Known limitations and manual steps

1. The projections and matchup factors are a static Week 2-style snapshot. There is no live sportsbook, schedule, injury, roster, or defensive-data feed.
2. The regression model, coefficients, training data, and original defensive inputs are not present in the repository. Only their resulting per-player values are present.
3. Player lines for names absent from the uploaded dataset are rejected and shown in the importer feedback.
4. The line importer is in-memory. To change the lines loaded after refresh, update `src/data/initial-prop-lines.ts` or paste them through the UI.
5. A source-data format change to the `PLAYER_DATA` marker can break `parsePlayerData()`.
6. Team/opponent strings must remain consistent with the source data for the game filter and matching context to work.
7. The app is static and has no authentication or user persistence.
8. The root workspace contains an API server and database library. They are not required by the dashboard UI, but database/API tooling requires `DATABASE_URL`.
9. Do not commit `.env` files, credentials, deployment tokens, or generated `dist/`/`node_modules/` directories.

## Handoff verification

The source snapshot was checked against the current deployment metadata before preparing the archive:

- Production URL: `https://java-script-dashboard--petepastorino.replit.app/`
- Deployment is active
- Deployment visibility is public
- Current deployment reports a successful build

The handoff archive includes the source asset, artifact configuration, workspace package manifests, and lockfile needed to reproduce the dashboard build. It does not include dependencies, build output, caches, credentials, or environment values.

The local build and the live production HTML reference the same hashed application bundles (`index-DuaMEHxN.js` and `index-cOMCWhJf.css`). Replit adds a referral script to the live HTML at serving time; that platform-injected script is not part of the application source and is the only observed HTML difference.
