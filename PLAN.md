# FilmFinder: Implementation Plan

See `DESIGN.md` for the full design. This plan breaks the work into milestones. Each ends with something runnable and checkable.

## Decisions (settled)

The full decision log, with status, is in `DESIGN.md`. Record new decisions there.

- Development continues in VS Code.
- Streamlit/Python prototype rejected (user's choice).
- Personal, non-commercial use only (user's choice).
- TypeScript + React + Vite, client-side only, static hosting.
- Canvas 2D rendering with d3 scales and zoom. PixiJS only if performance requires it.
- Zustand for state. Vitest and Playwright for tests.
- Data from IMDb datasets plus TMDB. Personal, non-commercial use.
- Scope: faithful core of the 1994 paper first, then extras.

## Milestone 0: Project setup

- [x] Scaffold with Vite (React + TS), strict `tsconfig`, ESLint, Prettier.
- [x] Add Vitest, Zustand, d3-scale, d3-zoom.
- [x] Folder layout: `src/engine/`, `src/components/`, `src/store/`, `scripts/`, `public/data/`, `data/` (gitignored).
- [x] `git init`, `.gitignore` (raw data, cache, API keys, `.env`).
- [x] Get a TMDB API key and put it in `.env` (not committed). Done by the user; values not verified yet. `.claude/settings.json` denies Claude access to `.env`.

**Done when:** `npm run dev` shows a blank app, and `npm test` runs.

**Status: done.** Used ESLint instead of the template's oxlint.

## Milestone 1: Data pipeline (IMDb only)

- [x] Download IMDb files into `data/raw/`. Files stay gzipped and are decompressed on the fly while streaming.
- [x] Stream-parse TSVs (the files are large, so no loading into memory at once).
- [x] Filter to feature films with at least 1,000 votes.
- [x] Join basics, ratings, and credits (3 directors, 5 actors, 5 actresses per film).
- [x] Emit `films.json`, `people.json`, `credits.json`, `meta.json` in the columnar schema.
- [x] Unit tests on a small fixture of TSV rows.

**Done when:** `npm run build-data` produces files in `public/data/` with a plausible film count (about 30-50k) and the output matches the schema.

**Status: done.** 7 fixture tests pass. Full run produced 49,134 films, 21,952 directors, 82,325 actors, 65,002 actresses. `films.json` is 3.1 MB, `people.json` 5.3 MB, `credits.json` 7.0 MB (before gzip). Column lengths match and a spot check (Shawshank Redemption) looks right.

Notes: `cert` is NR and `country`, `language`, `poster` are empty until M7 (akas skipped as too large). Nine legend genres and sort order are choices in `scripts/lib/config.ts` and `pipeline.ts`.

## Milestone 2: Query engine

- [x] Typed-array film store loaded from `films.json`. Rating is stored in tenths (integer) to avoid float32 rounding at slider bounds.
- [x] `RangeFilter`, `MaskFilter`, `SetFilter`, each with its own pass mask.
- [x] Result mask (AND) and count.
- [x] Valid-value computation per widget (all filters except its own).
- [x] Property test against a naive `Array.filter` reference.
- [x] Benchmark at 50k and 100k synthetic films.

**Done when:** tests pass and a full recompute at 50k films measures under 2 ms.

**Status: done.** Code in `src/engine/` (`store.ts`, `filters.ts`, `engine.ts`, plus `synthetic.ts` for test data). 16 tests pass in total, including a property test of 300 random filter combinations against a naive `Array.filter`. `npm run bench` results (median):

| Films | Drag update (rebuild one mask + recompute) | Valid range/bits for 3 widgets | Valid names (one alphaslider) |
| ----- | ------------------------------------------ | ------------------------------ | ----------------------------- |
| 50k   | 0.27 ms                                    | 0.40 ms                        | 0.16 ms                       |
| 100k  | 0.55 ms                                    | 0.81 ms                        | 0.40 ms                       |

The 2 ms target at 50k is met with plenty of headroom. Note: the benchmark uses synthetic data, and the engine is not yet connected to the real `films.json`.

## Milestone 3: Starfield

- [x] Canvas component with year (X) and rating (Y) scales, axes, genre colors.
- [x] Draws only films in the result mask. Redraws on store version change.
- [x] Zoom and pan with d3-zoom.
- [x] Spatial grid index for hover and click hit testing.
- [x] Overplotting reduction at low zoom.
- [x] Y-axis toggle between rating and votes (log).
- [x] Hover tooltip (title and year).

**Done when:** all films render, zoom and pan are smooth, and hover finds the right film.

**Status: done.** Unit tests pass (26 total: draw list and overplotting, spatial grid vs. brute force, jitter), plus lint, typecheck and `npm run build`. Checked in the browser by the user: renders, zooms and hovers correctly.

Implementation notes:
- Stars are spread within their year and +-0.05 of their rating (deterministic jitter in `src/engine/layout.ts`), because IMDb gives whole years and one-decimal ratings, so thousands of films would otherwise share one exact point.
- Overplotting: one star per 6x3 px cell, most-voted film wins. Zooming reveals the rest.
- Hit testing uses a screen-space grid built from the stars actually drawn each frame.
- Clicking a star sets `selected` in the store (highlighted red); the detail card is Milestone 6.
- Genre colors are in `src/genres.ts` (checked for colorblind safety in Milestone 8).

## Milestone 4: Basic widgets (dynamic queries working)

- [x] `RangeSlider` for length.
- [x] `CertCheckboxes` (G, PG, PG-13, R, NR).
- [x] `GenreLegend` toggle buttons.
- [x] Widgets wired to the store and engine, with updates coalesced per animation frame.
- [x] Result count ("N of M films").
- [x] Tight coupling for these widgets (disabled states and slider bounds).
- [x] Year range slider (added after the plan: there was no way to filter by year, only to zoom the starfield).

**Done when:** moving any widget updates the starfield continuously and smoothly.

**Status: done.** Checked in the browser by the user. 32 tests pass (6 new ones cover the query state: length range and end stops, cert checkboxes, genre any-of matching, and valid values ignoring a widget's own setting). Lint, typecheck and build are clean.

Notes:
- Widget state updates immediately; filters and the result are recomputed at most once per animation frame (`setQuery` in `src/store/useApp.ts`).
- Length slider spans 60-240 min (98% of films are 64-175). A thumb at an end stop means no limit on that side, so shorts and very long films stay in by default.
- Tight coupling: the length thumbs cannot move outside the range the other filters leave valid (shown as a lighter band on the track); certification checkboxes are disabled when no film would match; genre chips dim when unavailable.
- The Rating (certification) checkboxes: every film is NR until Milestone 7, so G, PG, PG-13 and R are disabled for now. That is expected.
- Genre chips match the genre a star is coloured by (its first listed genre among the nine). A first version matched any of a film's genres, which kept stars of other colours on screen after switching their genre off; changed after the user noticed. A film with several genres therefore appears only under its first one.
- The genre legend has a tenth chip, "Other", so films with only unlisted genres can still be toggled.

Year slider (added later): spans 1920-2025, end stops mean no limit (films exist from 1906 to 2026). It is an ordinary range filter, so it narrows the starfield, the count and the other widgets' valid values. Awaiting a visual check. A numeric rating-score range slider is not built yet (the engine supports it).

## Milestone 5: Alphasliders

Reference: `Ahlberg1994alphaslidera.pdf` (the Alphaslider paper), plus Color Plate 2 of the FilmFinder paper. An alphaslider selects **one name** from a long sorted list; only valid names (with films left under the other filters) can be reached.

- [x] Build `Alphaslider` in isolation (a small demo page).
- [x] Slide area with a two-zone thumb (coarse and fine), click-to-jump, arrow buttons with hold-to-repeat, keyboard support, "ALL" state, clear button.
- [x] Letter index spaced in proportion to the number of valid names per letter.
- [x] Valid-only skipping using the inverted index and the result mask.
- [x] Wire up Title, Actor, Actress, Director.
- [x] Names shown as "Last, First" and titles with the article moved to the end ("Magician, The"), as in the paper's color plate.
- [x] Accessibility: `role="slider"`, `aria-valuetext`.
- [x] Unit tests for the position-to-name mapping.

**Done when:** dragging an alphaslider filters the starfield, and the other widgets' valid values update (tight coupling visible).

**Status: reworked to match the paper; code done, awaiting a visual check by the user.** The first version did not follow the paper (equal-width letter segments, a vertical "micrometer" fine mode, "First Last" names), which made it hard to use and unclear. 78 tests pass; lint, typecheck and build are clean.

Behavior (from the paper's redesigned Alphaslider, Figure 8):
- One-line text output above the slider updates as you move. Click anywhere on the slide area to jump there.
- The track maps linearly onto the valid names, so each pixel covers about the same number of names. The index under the track gives each letter a share of the width proportional to its valid names; letters too narrow to label are omitted.
- Thumb: upper half (blue) is coarse and follows the pointer across the list; lower half (orange) is fine, one name per pixel. The paper found users miss granularity changes, so the border and a hint line show the active mode. The paper tested a "micrometer" (vertical movement) design and users found it confusing, so it was dropped.
- Arrow buttons at both ends step one name and repeat while held. Keys: arrows, Page Up/Down (letter), Home/End, Escape clears.
- Selecting a name filters to that name's films. The four sliders combine with each other and with the other widgets.

Where things are: pure logic in `src/engine/alphaModel.ts` and `src/engine/names.ts`; component `src/components/Alphaslider.tsx`; wiring in `src/components/AlphaSliders.tsx` and `src/store/`. Isolated demo: `npm run dev`, then open `/alphaslider-demo.html`.

Notes and limits:
- "Last, First" uses a heuristic (last word is the surname, particles like "von"/"de" and suffixes like "Jr." handled). IMDb stores given name first, so some names, especially East Asian ones, will file under the wrong word.
- Title list is built in the browser from `films.json` (about 22 ms). People lists load from `people.json` in the background after the films, so those three sliders show "loading…" briefly. Refreshing valid names for all four sliders was measured at about 2 ms on the real data.
- Names starting with letters that do not fold to a-z (e.g. Þ, Ø) sit under `#`. Two different people with the same name share one entry.
- Fine movement is one name per pixel; the paper used 100/20/1 names per movement for coarse/medium/fine on a 10,000-item list and suggests two granularities with large grab areas is enough.

## Milestone 6: Details on demand

- [x] `DetailCard` with title, year, director, country, language, cast, rating, runtime.
- [x] Position near the selected point. Close with Escape or an outside click.
- [x] Lazy load `credits.json` on first open.
- [x] Highlight the selected point on the starfield.
- [x] Associative search: clicking a person's name in the card sets that alphaslider and clears the others.

**Done when:** clicking a film shows its card, and clicking a name re-queries.

**Status: done; the user confirmed the card opens with poster and photos. Not yet confirmed: clicking a name (associative search) and Escape/outside-click closing.** 105 tests pass in total (new: card placement and the person query); lint, typecheck and build are clean.

- Click a star to open the card (title, year, director, rating and votes, length, certification when known, country and language once TMDB data is in, actors, actresses, and the poster when there is one). The selected star gets a red outline.
- The card sits next to the star (right and below by default, flipping to stay inside the plot) and follows it while you zoom and pan; if the star leaves the view the card hides until it returns.
- Close with Escape, the close button, a click outside the card, or a click on empty starfield.
- `credits.json` (7 MB) loads the first time a card opens; the cast shows "loading…" until then.
- Clicking a name in the card does an associative search: that person's films only. I read the open question "clear other filters or combine" as clearing everything else (all alphasliders, year, length, ratings, genres), so you see the person's whole filmography. Say so if you would rather keep the other filters.
- Names are links only once the people lists have loaded (a second or two after the page opens).
- Posters need the TMDB data, so they appear after the enrichment fetch and data rebuild.

## Milestone 7: TMDB enrichment

- [x] Look up each film by IMDb id on TMDB.
- [x] Certification, with US preferred, normalized to `G | PG | PG-13 | R | NR`.
- [x] Poster paths, language, country, and cast photo paths.
- [x] Disk cache and rate limiting, resumable, with a `--limit` flag.
- [x] Re-emit data with `cert` and `poster` filled in.
- [x] Show posters in the detail card.
- [x] Add the TMDB attribution line to the footer.

**Done when:** most films have a certification (the NR bucket is a minority), and posters show in the card. Posters show; but NR is 61%, not a minority, so the first half of this target is not met and cannot be, given what TMDB has.

> Milestone 7 can be moved earlier or run in the background while Milestones 2-6 are built. Until it lands, `cert` is `NR` for everything.

**Status: done (moved up from its planned place after the user could not filter by rating, because every film was NR). Checked in the browser by the user: the card shows posters and people photos.** 108 tests pass.

Result of the full fetch and rebuild (49,134 films):
- Certifications: G 772 (1.6%), PG 3,204 (6.5%), PG-13 4,430 (9.0%), R 10,562 (21.5%), NR 30,166 (61.4%). NR is the largest bucket because TMDB often has no US certification: 3% of films from 1900-1949 have one, 31% from 1950-1979, 60% from 1980-1999, 37% from 2000 on (recent foreign and small releases).
- Posters for 48,752 films, country for 47,825, language for 48,801. About 230 films are not on TMDB at all.
- Photos for 316,011 of 429,755 credited people (74%).

- `npm run enrich [-- --limit N]` fetches one TMDB record per film into `data/cache/tmdb/` (resumable; about 30 requests per second). Credentials are read from `.env` and never printed. `npm run build-data` merges the cache into `films.json`.
- A 20-film trial worked: all found, all with a US certification (e.g. The Godfather R, Forrest Gump PG-13).
- Certification uses the US release data, preferring the theatrical release. G, PG, PG-13 and R map to codes 0-3; NC-17, unrated and missing become NR.
- Country is the first production country and language the original language, stored as ISO codes (format with `Intl.DisplayNames`).
- The same request also returns the credits, so people photos come at no extra cost: directors and the top 14 billed cast who have a photo. At build time they are matched to our "Last, First" credit names by accent- and case-insensitive name and stored per film in `credits.json` (`photos`). On a 30-film trial: directors 31 of 31, cast 194 of 208 (93%); the misses are mostly minor or uncredited roles. People with no match show an empty slot instead of a photo.
- The detail card shows the poster and a small photo beside each person's name (code done, untested in a browser). The fetch was restarted once to add the people data (the first pass only had poster, certification, language and country).
- The TMDB attribution line is in the side panel footer.
- Size note: `credits.json` grew from 7 MB to 23 MB because photo paths are stored per film and barely compress. Storing each person's photo once (not per film) would cut it a lot; not done yet.

## Milestone 7b: Wikidata sample dataset (added after the plan)

Why: the IMDb and TMDB data cannot be redistributed, so a repository containing it is not allowed, and one without it cannot run. Wikidata is CC0, so a small extract can be committed and a fresh clone runs with no accounts or downloads.

- [x] `npm run build-wikidata`: SPARQL queries against Wikidata in small batches, with retries and an on-disk cache (resumable). Output uses the same four JSON files as the IMDb build, written to `public/sample-data/`.
- [x] Shared data format carries its own labels (`meta.source`, `sourceLabel`, `attribution`, `hasRating`, `popularityLabel`, `images` URL templates), so the interface adapts: footer text, Y axis choices, the card's rating row, poster and photo URLs. Older `meta.json` files still load.
- [x] The app loads `public/data/` if it exists, else `public/sample-data/`; `?data=sample` forces the sample.
- [x] Without a rating, the Y axis is popularity (number of Wikipedia language editions, log scale, computed from the data); the log axis ticks no longer assume IMDb vote counts.
- [x] `.gitignore`: IMDb-derived `public/data/` and the paper PDFs are ignored; `public/sample-data/` is committed.
- [x] README rewritten: quick start with the sample, a comparison table, IMDb and TMDB account and key setup, how to rebuild the sample.
- [x] Rebuild the sample with animated and anime films included, and count their type as the Animation genre.

**Status: done. Not yet looked at in a browser by the user; the end-to-end tests exercise it in Chrome.**

Result (sample as committed, after the review fixes and the animation fix): 4,397 films, 1913 to 2026; 1,848 directors, 6,611 actors, 6,771 actresses; 1.6 MB in total. Certifications from the MPA rating: G 138, PG 540, PG-13 673, R 866, NR 2,180 (50%). Colour genres: Drama 901, Comedy 552, Action 778, Romance 528, Horror 441, Sci-Fi 429, Mystery 128, Documentary 27, Animation 374, Other 239. Posters for only 283 films (6%); photos for 11,606 of 15,230 people (76%). Checked through the app's own engine code and in Chrome by the end-to-end tests. One famous film is still missing and unexplained: the original "Toy Story" (its four sequels are present).

Lessons from building it:
- One large query joining films, people, labels, genders and images timed out on the public service even for 25 films; splitting it (credit links first, then person details by id) made each query take seconds.
- Querying "instance of film" alone silently left out about 330 animated and anime films, which Wikidata files under more specific types. It was found by noticing missing famous titles, not by any test. Adding them was not enough: Wikidata records "animated film" as the item's type and not as a genre, so the Animation legend stayed at 13 films until the type was also counted as the genre (now 374).
- The film set is "at least 30 Wikipedia language editions", so it favours Western and widely translated films.
- Cast has no billing order on Wikidata, so the best-known people come first; country is the US if listed, otherwise the alphabetically first (a heuristic).

## Review fixes (from `CRITIQUE.md`, added after the plan)

An outside review of the code found four real problems, and noted that the application had not been exercised in a browser by the reviewer. Each finding was checked against the code before fixing it.

- [x] **Range sliders could create empty queries (high).** The lower thumb was clamped by the available minimum and the other thumb but not by the available maximum, so with only 1980-1990 left you could drag Year's minimum to 2000 and get no films; and a gap between two years with films could still be selected. The earlier claim "thumbs cannot move outside the valid range" was overstated. Now each thumb snaps to a value that actually occurs under the other filters (`presentValues` in the engine, `src/engine/rangeSnap.ts`), and a range whose thumbs are on occurring values is never empty. End stops keep their "no limit" meaning. A randomised test (500 trials of 20 moves) checks that no move gives an empty range.
- [x] **People with the same name were merged (high).** Lists were keyed by display name, so clicking one "John Smith" could show another's films, and photos were looked up by name. Now people are identified by id (IMDb `nconst`, Wikidata item) throughout: the people lists have one entry per person, credits refer to people by index, photos are stored once per person, and namesakes get a label with their best-known film. In the IMDb data this separated **1,348 people** who had been merged (65 directors, 916 actors, 367 actresses). A side effect: `credits.json` went from 23 MB to 2.6 MB. This was a data format change (`meta.version` is now 3); the app skips older data and says so.
- [x] **A failed secondary load stayed on "loading…" (medium).** The people and cast lists now have loading, ready and error states with a Retry button, and the rest of the application keeps working while one list is down.
- [x] **No keyboard route to choose a film (medium).** A results list (the 50 best-known matches for the current query) in the side panel opens the detail card from the keyboard. Focus moves into the card, Escape closes it, and focus returns to the list item. It also helps with dense clusters where a pointer cannot pick out one star.
- [x] **Browser test.** Playwright drives the installed Google Chrome (no browser download): `npm run e2e`. It covers the range-slider case above, the alphaslider, a keyboard-only run of filter, choose a film, inspect, follow a person and reset, focus return, failure and retry of both lists, and latency. By default it runs on the committed sample; `E2E_DATA=full npm run e2e` runs it on your own IMDb build.
- [x] **Input-to-redraw latency in a real browser.** Measured on the full IMDb data (49,134 films): median 50 ms, 95th percentile 50 ms, under the paper's 100 ms target. That figure is three animation frames at 60 Hz, so it is dominated by frame scheduling and not by computation (the engine itself takes well under a millisecond): a change is applied at the next frame, React re-renders, and the starfield redraws at the frame after that. Applying the query and drawing in the same frame would cut it to about two frames; not done.

Unit tests grew from 134 to 170 (range snapping, people identity in both pipelines, labels for namesakes, loading states, results list), plus the end-to-end tests. Status: done in code and verified in Chrome by the end-to-end tests; the interface changes (results list, retry buttons, snapping thumbs) have not yet been looked at by the user.

## Milestone 8: Polish and verification

- [ ] Layout and styling to match the paper's feel (dark starfield, colored legend).
- [ ] Colorblind-aware palette check.
- [~] Performance pass against the targets in `DESIGN.md` section 7. The engine benchmark and a real-browser latency test exist (see Review fixes); load time, memory and hover timing are not measured.
- [x] Playwright smoke test (see Review fixes: it is a full interaction test, not just a smoke test).
- [x] README with setup steps (get TMDB key, run pipeline, run the app).

**Done when:** a fresh clone can follow the README to a working app, and the smoke test passes.

Remaining in this milestone: the colour-blind check of the genre palette, and finishing the performance pass.

## Backlog (post-v1)

- URL-encoded query state, so queries are shareable.
- Watchlist saved in `localStorage`.
- Touch and mobile layout.
- PixiJS/WebGL renderer.
- Additional filters (country, language, decade presets).

## Order and dependencies

```
M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M8
              \------------------------> M7 (parallel, after M1)
```

M2 and M3 can overlap once M1 produces data. M5 is the riskiest item, so start it once M4 is stable.

## Open questions

1. Default Y axis: rating or vote count? (Plan: rating, with a toggle.)
2. Does clicking a person in the detail card clear other filters or combine with them? (Plan: clear.)
3. Do we deploy it anywhere, or only run locally? (Plan: local, with static deploy optional.)
