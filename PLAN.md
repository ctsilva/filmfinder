# FilmFinder: Implementation Plan

See `DESIGN.md` for the design and the full decision log (record new decisions there), and `README.md` for setup.

## Decisions (settled)

- TypeScript + React + Vite, client-side only, static hosting. Developed in VS Code.
- Canvas 2D with d3 scales and zoom; PixiJS only if performance requires it.
- Zustand for state. Vitest for unit tests, Playwright (installed Chrome) for end-to-end.
- Data: IMDb datasets plus TMDB for the full build; a committed Wikidata sample (CC0) so a fresh clone runs with no accounts. Personal, non-commercial use only. The Streamlit/Python prototype was rejected.
- Scope: a faithful core of the 1994 paper first, then extras.

## Status

| Milestone | State |
| --- | --- |
| M0 Project setup | done |
| M1 Data pipeline (IMDb) | done |
| M2 Query engine | done |
| M3 Starfield | done |
| M4 Basic widgets | done |
| M5 Alphasliders | code done, awaiting a visual check |
| M6 Details on demand | done; name-click and close behaviour not yet confirmed by the user |
| M7 TMDB enrichment | done |
| M7b Wikidata sample | done, not yet looked at by the user |
| Review fixes | done, new UI not yet looked at by the user |
| M8 Polish and verification | partly done (see below) |

170 unit tests plus the end-to-end suite pass; lint, typecheck and build are clean.

## What exists

**M1 data pipeline.** `npm run build-data` streams the gzipped IMDb TSVs and filters to feature films with at least 1,000 votes. It joins basics, ratings and credits (3 directors, 5 actors, 5 actresses per film) and writes `films.json`, `people.json`, `credits.json` and `meta.json` (columnar) to `public/data/`. Full run: 49,134 films. Genre legend and sort order live in `scripts/lib/config.ts` and `pipeline.ts`.

**M2 engine** (`src/engine/`). Typed-array film store (rating in tenths), range, mask and set filters with per-filter pass masks, a result mask, and valid-value computation per widget (all filters except its own). Checked by a property test against a naive `Array.filter`. Median benchmark (`npm run bench`) at 50k films: 0.27 ms per drag update, 0.40 ms for valid ranges of three widgets, 0.16 ms for one alphaslider's valid names, well under the 2 ms target.

**M3 starfield.** Year (X) by rating or log votes (Y), genre colours, zoom and pan, hover tooltip, click to select (red outline). Stars are jittered within their year and rating (`src/engine/layout.ts`) because IMDb has whole years and one-decimal ratings. Overplotting: one star per 6x3 px cell, most-voted wins. Hit testing uses a screen-space grid built from the stars drawn each frame.

**M4 widgets.** Length slider (60-240 min), year slider (1920-2025), certification checkboxes, genre legend (nine genres plus "Other"), result count. End stops mean "no limit". State updates immediately; filters and result recompute at most once per animation frame (`setQuery` in `src/store/useApp.ts`). Tight coupling: thumbs, checkboxes and chips reflect what the other filters leave valid. A genre chip matches the genre a star is coloured by (its first listed genre among the nine). A numeric rating-score range slider is not built (the engine supports it).

**M5 alphasliders** (Title, Actor, Actress, Director), following the redesigned Alphaslider in the paper (Figure 8, Color Plate 2). Logic in `src/engine/alphaModel.ts` and `names.ts`; components `Alphaslider.tsx` and `AlphaSliders.tsx`; isolated demo at `/alphaslider-demo.html` under `npm run dev`.
- The track maps linearly onto valid names only. The letter index gives each letter width proportional to its valid names.
- Thumb: upper half (blue) coarse, lower half (orange) fine at one name per pixel. Arrow buttons repeat while held. Keys: arrows, Page Up/Down (letter), Home/End, Escape clears. `role="slider"` with `aria-valuetext`.
- Names shown as "Last, First", titles as "Magician, The". The surname heuristic (particles, suffixes) will misfile some names, especially East Asian ones. Names that do not fold to a-z sit under `#`.
- The first version did not follow the paper (equal-width letters, vertical micrometer fine mode) and was reworked; the paper's micrometer design was found confusing and is not used.

**M6 detail card.** Opens on star click or from the results list; placed beside the star and follows zoom and pan; closes with Escape, the close button, or an outside click. Shows poster, people photos, title, year, rating and votes, length, certification, country, language and cast. `credits.json` loads on first open. Clicking a person does an associative search that clears all other filters (open question 2).

**M7 TMDB enrichment.** `npm run enrich [-- --limit N]` fetches one record per film into `data/cache/tmdb/` (resumable, about 30 requests/s; credentials from `.env`, never printed); `npm run build-data` merges it. Provides US certification (G, PG, PG-13, R, else NR), poster, country, language and people photos. Result: posters for 48,752 films and photos for 74% of credited people. NR is 61% of films because TMDB often has no US certification (3% of 1900-1949 films, 37% of 2000 onward), so "NR is a minority" cannot be met with this source. TMDB attribution is in the footer.

**M7b Wikidata sample.** `npm run build-wikidata` (batched SPARQL, retries, resumable cache) writes the same four files to `public/sample-data/`, which is committed (4,397 films, 1.6 MB). The app loads `public/data/` if present, else the sample; `?data=sample` forces the sample. `meta.json` carries source labels, attribution, `hasRating` and image URL templates, so the UI adapts: without ratings the Y axis is popularity (Wikipedia language editions, log). Known limits: the film set is "at least 30 language editions", so it favours Western films; cast has no billing order; the original "Toy Story" is missing and unexplained; only 6% of films have posters.

Lessons: one big SPARQL join timed out, so split it (credit links first, then person details by id). Querying "instance of film" silently missed about 330 animated and anime films, and Wikidata records "animated film" as a type rather than a genre, so the type is also counted as the Animation genre.

**Review fixes** (from an outside code review; each finding was checked before fixing):
- Range sliders could create empty queries. Thumbs now snap to values that occur under the other filters (`src/engine/rangeSnap.ts`), checked by a randomised test.
- People with the same name were merged. People are now identified by id throughout (1,348 merged people separated in the IMDb data); namesakes get a label with their best-known film. `meta.version` is 3 and older data is skipped with a message. `credits.json` fell from 23 MB to 2.6 MB.
- Failed people or cast loads no longer stick on "loading…": loading, ready and error states with Retry.
- Keyboard route to pick a film: a results list of the 50 best-known matches in the side panel; focus moves into the card and returns on close.
- `npm run e2e` drives installed Chrome on the sample (`E2E_DATA=full` for the IMDb build): range snapping, alphaslider, keyboard-only flow, retry, latency.
- Measured input-to-redraw latency on the full data: median 50 ms, p95 50 ms (target 100 ms). This is three animation frames; applying the query and drawing in the same frame would cut it to two (not done).

## Remaining

**M8 polish and verification.** Done: Playwright test, README.
- [ ] Layout and styling closer to the paper's feel (dark starfield, coloured legend).
- [ ] Colour-blind check of the genre palette (`src/genres.ts`).
- [ ] Finish the performance pass against `DESIGN.md` section 7: load time, memory and hover timing are not measured.
- [ ] User visual check of the M5 alphasliders, the M6 name-click and close behaviour, the M7b sample, and the results list, retry buttons and snapping thumbs.

**Done when:** a fresh clone follows the README to a working app and the end-to-end test passes.

## Backlog (post-v1)

- URL-encoded query state so queries are shareable.
- Watchlist in `localStorage`.
- Touch and mobile layout.
- PixiJS/WebGL renderer.
- Additional filters (country, language, decade presets); rating-score range slider.
- Same-frame query apply and draw to cut latency to two frames.

## Open questions

1. Default Y axis: rating or vote count? (Current: rating, with a toggle.)
2. Should clicking a person in the card clear other filters or combine with them? (Current: clear.)
3. Deploy anywhere, or run locally only? (Current: local, static deploy optional.)
