# FilmFinder: Design Document

A modern recreation of the FilmFinder from Ahlberg & Shneiderman, _Visual Information Seeking using the FilmFinder_ (CHI '94 Companion). Personal, non-commercial project.

## Decision log

| Decision                             | Choice                                                 | Status                    | Why                                                                      |
| ------------------------------------ | ------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------ |
| Language and UI framework            | TypeScript + React (Vite)                              | Decided by user           | User preference                                                          |
| Python/Streamlit prototype           | Rejected                                               | Decided by user           | User dislikes Streamlit, and it can't deliver continuous dynamic queries |
| Use case and licensing               | Personal, non-commercial only                          | Decided by user           | Makes the IMDb datasets and a free TMDB key usable                       |
| Architecture                         | Client-side only, static data files, no backend        | Proposed, not objected to | Dynamic queries need under 100 ms response                               |
| Rendering                            | Canvas 2D + d3 scales/zoom, PixiJS as fallback         | Default                   | Handles about 50k points                                                 |
| Scope                                | Faithful core of the paper first, then extras          | Default                   |                                                                          |
| Film set                             | Feature films with at least 1,000 votes (about 30-50k) | Default                   |                                                                          |
| Second data source                   | Wikidata sample (CC0), committed to the repository      | Decided by user           | IMDb and TMDB data cannot be redistributed, so a repo with the data in it needs a source that can |
| Code licence                         | MIT                                                    | Decided by user           | Permissive; the code is for teaching. Data and papers have separate terms |
| Y axis                               | Rating by default, vote-count toggle                   | Provisional               | Paper says "popularity"; IMDb has no direct equivalent                   |
| Clicking a person in the detail card | Clears other filters                                   | Provisional               | Simplest associative-search behavior                                     |
| Deployment                           | Run locally, static deploy optional                    | Provisional               | Personal use                                                             |
| Development environment              | VS Code                                                | Decided by user           | The user continues there                                                 |

"Provisional" items were my defaults and the user has not confirmed them. Update this table whenever a decision changes.

## 1. Goals and non-goals

**Goals**

- Reproduce the paper's three ideas: **dynamic queries**, a **starfield display**, and **tight coupling** between widgets and display.
- Feel instant: every widget change updates the display in well under 100 ms, with no submit button.
- Run entirely in the browser from static files. No backend.

**Non-goals (v1)**

- User accounts, server-side search, streaming availability, recommendations.
- Commercial use or redistribution of the data.
- Mobile-first design. It should work on touch but is desktop-first.

## 2. Features

| #   | Feature                                                              | Source in paper                                |
| --- | -------------------------------------------------------------------- | ---------------------------------------------- |
| F1  | Starfield: one point per film. X = year, Y = rating, color = genre   | "Starfield display"                            |
| F2  | Dynamic queries: display updates continuously while dragging         | "Dynamic queries"                              |
| F3  | Alphasliders for Title, Actor, Actress, Director                     | "Alphaslider"                                  |
| F4  | Range slider for length (minutes)                                    | Length widget                                  |
| F5  | Rating checkboxes (G, PG, PG-13, R)                                  | Ratings widget                                 |
| F6  | Genre legend that doubles as toggle buttons                          | Color legend                                   |
| F7  | Tight coupling: widgets only offer values that still produce results | "Eliminates empty and invalid query results"   |
| F8  | Details on demand: click or hover a point to see a film card         | "Details on demand"                            |
| F9  | Zoom and pan on the starfield (overview first, zoom, then details)   | Shneiderman mantra                             |
| F10 | Associative search: "use this result as the next query"              | "Incremental, exploratory, associative search" |

**Later (post-v1):** URL-encoded queries, watchlist, touch polish, WebGL renderer.

### Deviations from the paper

- The paper's Y axis is a "measure of popularity". With IMDb data we use **average rating** by default, with a toggle for **vote count** (log scale). With the Wikidata sample there is no rating, so the Y axis is **popularity** itself: the number of Wikipedia language editions (log scale), which is closer to the paper's wording.
- The paper's nine genres are kept for the legend. IMDb films can have several genres, so each film's color uses its **first listed genre among the nine**. The genre toggle matches the **same genre the star is coloured by**, so each legend button shows and hides exactly its own colour. (Earlier it matched any of a film's genres, which left stars of other colours on screen after switching their genre off.)
- A rating bucket **"NR/Unknown"** is added because many films have no MPAA certification.

## 3. Platform and stack

- **Language/UI:** TypeScript (strict), React 18, Vite.
- **State:** Zustand (small, no boilerplate, works well with selector-based re-rendering).
- **Rendering:** HTML Canvas 2D with `d3-scale` and `d3-zoom`. Rects are drawn in one pass per frame. If frame time exceeds budget at the target scale, swap in PixiJS behind the same `Starfield` interface.
- **Data loading:** `fetch` of static columnar JSON, decoded into typed arrays.
- **Tests:** Vitest for the query engine and pipeline, Playwright for one smoke test of the UI.
- **Pipeline:** Node + TypeScript scripts run with `tsx`, kept in `scripts/`.
- **Hosting:** static. Run locally with `vite preview`, or deploy to GitHub Pages.

## 4. Data

### 4.1 Sources

| Data                                              | Source                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| tconst, title, year, runtime, genres, titleType   | IMDb `title.basics.tsv.gz`                                                 |
| averageRating, numVotes                           | IMDb `title.ratings.tsv.gz`                                                |
| Director / actor / actress ids                    | IMDb `title.principals.tsv.gz` (categories `director`, `actor`, `actress`) |
| Person names                                      | IMDb `name.basics.tsv.gz`                                                  |
| Country, language                                 | IMDb `title.akas.tsv.gz` (fallback: TMDB)                                  |
| MPAA certification, poster path, cast photo paths | TMDB API (`/find` by IMDb id, `/movie/{id}`, `/release_dates`)             |

IMDb datasets are for personal, non-commercial use. TMDB requires attribution (a "powered by TMDB" line in the UI footer) and a free API key.

### 4.2 Film selection

`titleType == "movie"`, `numVotes >= 1000`, has `startYear`, `runtimeMinutes`, and at least one genre. Expect roughly 30,000 to 50,000 films. The threshold is a constant in the pipeline config.

### 4.3 Pipeline steps (`scripts/build-data.ts`)

1. **Download** the IMDb files to `data/raw/` if missing or older than N days.
2. **Filter and join** `basics` + `ratings` to the selected film set.
3. **Credits:** from `principals`, keep for each film up to 3 directors and the first 5 billed actors and 5 billed actresses. Resolve names via `name.basics`.
4. **Enrich** with TMDB (certification, poster path, language, country, cast photos). Calls are cached on disk in `data/cache/tmdb/<tconst>.json` and rate limited (roughly 40 req/s max). The step is resumable, so a crash or Ctrl+C never loses progress.
5. **Normalize** certification to `G | PG | PG-13 | R | NR`. Anything else (NC-17, unrated, missing) maps to `NR`.
6. **Emit** files into `public/data/`:
   - `films.json`: columnar arrays, one entry per film index.
   - `people.json`: sorted unique name lists for actors, actresses, directors, with film index lists (inverted index).
   - `meta.json`: version, build date, counts, TMDB image base URL.

### 4.4 Output schema (columnar)

```ts
interface FilmsFile {
  count: number
  id: string[] // IMDb tconst
  title: string[]
  year: number[] // Int16
  length: number[] // minutes, Int16
  rating: number[] // 0-10, one decimal
  votes: number[] // Int32
  genreMask: number[] // bitmask over the 9 legend genres + "other"
  primaryGenre: number[] // index 0-9 for color
  cert: number[] // 0=G 1=PG 2=PG-13 3=R 4=NR
  country: string[]
  language: string[]
  poster: (string | null)[]
}

interface PeopleIndex {
  names: string[] // display names "Last, First", sorted by a collation key
  films: number[][] // films[i] lists the film indexes of person i, ascending
  photos?: (string | null)[] // photo path of person i, or null
}

interface PeopleFile {
  directors: PeopleIndex
  actors: PeopleIndex
  actresses: PeopleIndex
}

interface CreditsFile {
  // per film, in billing order: indexes into the matching PeopleFile list
  directors: number[][]
  actors: number[][]
  actresses: number[][]
}
```

**People are identified by id, never by name.** Each entry in a people list is one person (IMDb `nconst`, Wikidata item id), so two different people with the same display name are two entries with their own films, photos and credits. Names are only labels. Where names collide the alphaslider appends the person's best-known film ("Smith, John · Some Film"). An earlier version keyed these lists by name and silently merged namesakes: about 1,350 people in the IMDb data.

Columnar JSON compresses well (gzip by the host) and decodes straight into typed arrays. Cast lists for the detail card are stored per film in `credits.json` and loaded lazily, since only clicked films need them. A person's photo is stored once, in `people.json`, not once per film. `meta.json` has a `version` (now 3); the app skips a data folder built by an older version and says so.

### 4.5 Second data source: Wikidata (sample)

`npm run build-wikidata` writes the same four JSON files (`films`, `people`, `credits`, `meta`) from Wikidata into `public/sample-data/`, which is committed. Wikidata is CC0, so unlike the IMDb and TMDB data it can live in the repository, and a fresh clone runs without accounts or downloads. The app loads `public/data/` (built from IMDb and TMDB) when it exists and falls back to `public/sample-data/`; `?data=sample` forces the sample.

- **Film set:** items that are a film, an animated film or an anime film, with a release date, a runtime and at least 30 Wikipedia language editions (a threshold flag, `--min-sitelinks`). That is a few thousand well-known films. Animated and anime films have to be asked for by name: they are usually filed under those more specific types, and querying plain "film" alone left out most of the Animation genre (found when "Spirited Away" and "Toy Story" were missing).
- **Mapping:** year from the earliest release date; length from the shortest listed runtime; genre from Wikidata genre items mapped to the nine legend genres (the colour genre is chosen by a fixed priority because Wikidata genres are unordered; animated and anime films count as Animation because Wikidata records that as their type, not a genre); certification from the MPA rating (G, PG, PG-13, R; everything else NR); country is the US if it is a production country, otherwise the alphabetically first; language from the original-language item.
- **No rating:** `rating` is unused (`meta.hasRating = false`), and `votes` holds the number of Wikipedia editions. The Y axis shows it in place of the rating, labelled from `meta.popularityLabel`.
- **Cast:** Wikidata has no billing order, so the best-known people (most Wikipedia editions) are listed first, five actors and five actresses, split by the gender property.
- **Images:** posters (few films have one) and people photos are Wikimedia Commons files, loaded from Commons and licensed per file. `meta.images` holds URL templates with a `{path}` placeholder, the same mechanism the TMDB build uses.
- **Queries:** one large query times out on the public service, so the film list, per-film details, credit links and person details are fetched as separate small queries in batches. Every response is cached in `data/cache/wikidata/`, so an interrupted run resumes.

`meta.json` carries `source`, `sourceLabel`, `attribution`, `hasRating`, `popularityLabel` and `images`, so the interface (footer, Y axis choices, card) adapts to whichever dataset is loaded.

## 5. Query engine

All filtering is in memory, in a `QueryEngine` class with no React dependency, so it is unit-testable.

### 5.1 Structure

- Film attributes live in typed arrays (`Int16Array`, `Float32Array`, `Uint8Array`).
- Each **filter** is one of: `RangeFilter` (year, length, rating), `MaskFilter` (cert, genre), `SetFilter` (person or title selection, backed by the inverted index).
- Each filter owns a `Uint8Array(count)` **pass mask**: 1 if the film passes that filter alone.
- The **result mask** is the AND of all filter masks. It is computed in a single loop over `count` entries.

At 50k films, one full recompute is a few hundred microseconds to about a millisecond. Only the changed filter's mask is rebuilt, then the AND runs again.

### 5.2 Tight coupling (valid values)

For each widget W, the set of **selectable values** is computed from the result mask of **all filters except W's own**. This is the standard dynamic-query rule: a widget never excludes values just because of its own setting.

- For alphasliders: the valid names are those with at least one film in the mask. We compute this by walking the inverted index of the visible names and checking the mask. This is bounded by the number of names in view, not the entire list.
- For the length slider and checkboxes: min/max and enabled states come from the same mask.

To keep this cheap, valid-value computation for a widget runs only when another widget changed, and is deferred to the next animation frame.

### 5.3 Update flow

```
widget input -> store.setFilter(id, value)
             -> engine.updateFilter(id, value)       // rebuild one mask
             -> engine.recompute()                   // AND, count
             -> store.version++                      // triggers redraw + widget refresh
Starfield rAF -> reads engine.resultMask, draws
```

Slider drags are coalesced to one update per animation frame.

## 6. UI design

### 6.1 Layout

```
+-------------------------------------------+------------------+
|                                           |  FilmFinder logo |
|                                           |  Title   [alpha] |
|            Starfield (canvas)             |  Actor   [alpha] |
|                                           |  Actress [alpha] |
|                                           |  Director[alpha] |
|                                           |  Length  [range] |
+-------------------------------------------+  Rating  [G PG ] |
| [Drama][Mystery][Comedy]...  genre legend |  N of M films    |
+-------------------------------------------+------------------+
```

A detail card appears over the starfield near the selected point (as in the paper's Color Plate 2) and is dismissed by clicking elsewhere or pressing Escape.

### 6.2 Components

```
App
 +- Starfield            canvas, zoom/pan, hit testing, hover/click
 |   +- AxisLayer        axes and ticks (SVG overlay or canvas)
 +- GenreLegend          9 toggle buttons, colored
 +- QueryPanel
 |   +- Alphaslider x4   title, actor, actress, director
 |   +- RangeSlider      length
 |   +- CertCheckboxes   G / PG / PG-13 / R / NR
 |   +- ResultCount
 +- DetailCard           selected film
 +- Footer               TMDB / IMDb attribution
```

### 6.3 Starfield

- Points are small rectangles (about 6x3 px, as in the paper), colored by primary genre. Colors are chosen to be distinguishable and colorblind-aware, and are a single config table.
- Films that fail the query are not drawn (the paper discards them).
- **Hit testing:** a uniform grid spatial index over the data (rebuilt on zoom/pan change) gives nearest-point lookup in O(1) average. Hover highlights the point and shows a tooltip with the title. Click opens the detail card.
- **Zoom/pan:** `d3-zoom` on the canvas. Scales are updated and the canvas redrawn. Axes follow the zoom transform.
- **Overplotting:** when more than N points land in one pixel cell at the current zoom, draw one point (the highest-voted) for that cell. Zooming reveals the rest.

### 6.4 Alphaslider

The paper's compact selector for large ordered lists.

- A thumb moves along a track of A-Z letters. Dragging scrolls a sorted list of valid names, coarsely by letter and finely by position within the letter.
- Arrow keys step by one name, and Page Up/Down jump by letter.
- The current value shows above the track ("ALL" when unconstrained). A clear button resets it to ALL.
- **Valid-only:** names with zero films in the current result mask are skipped during dragging (tight coupling).
- Accessible: the thumb is a `role="slider"` with `aria-valuetext` set to the current name.

### 6.5 Associative search (F10)

In the detail card, clicking a director or actor name sets that widget's value and clears the others. The starfield then shows that person's films.

## 7. Performance targets

| Metric                      | Target                |
| --------------------------- | --------------------- |
| Initial data load (gzipped) | < 3 MB, < 2 s locally |
| Filter update to repaint    | < 16 ms at 50k films  |
| Hover hit test              | < 1 ms                |
| Memory                      | < 150 MB              |

Measure with the Performance panel and a synthetic 100k-film dataset to confirm headroom.

## 8. Testing

- **Unit (Vitest):** each filter type, mask AND, valid-value computation, alphaslider position-to-name mapping, certification normalization, pipeline joins on a small fixture of IMDb rows.
- **Property test:** for random filter combinations, the engine's result equals a naive `array.filter` over the same data.
- **UI smoke (Playwright):** load the page, drag a slider, confirm the film count changes, click a point, confirm the card appears.

## 9. Risks and open questions

| Risk                                             | Mitigation                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| TMDB certification coverage is incomplete        | `NR` bucket. Fall back to the US release-date certification field.          |
| IMDb data has no popularity score like the paper | Vote count is the proxy. Toggle between rating and votes on the Y axis.     |
| Alphaslider is novel and fiddly to build         | Build it as an isolated component with its own tests before wiring it in.   |
| 50k points may drag on low-end machines          | Overplotting reduction, then the PixiJS fallback behind the same interface. |
| TMDB enrichment takes a long time                | On-disk cache, resumable, and a `--limit` flag for development.             |

**Open questions:** Should we show Y as rating or votes by default? Should the person's name in the detail card clear all other filters, or combine with them? We default to clearing.
