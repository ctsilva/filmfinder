# FilmFinder, rebuilt

A modern, browser-based recreation of the **FilmFinder** from Ahlberg & Shneiderman's 1994 papers on dynamic queries, starfield displays and the Alphaslider.

## Why this exists

This project was written for a class on interaction. The goal was to use a classic paper by Ben Shneiderman and colleagues as a worked example of **how to reproduce a paper with an LLM**: give the model the paper, agree on a design and a plan, build it in small checked steps, and look at the result yourself.

The code was written by Claude (Anthropic's LLM) working through Claude Code, with a person making the decisions, supplying the papers, running the app and saying when something felt wrong. The planning documents and the mistakes along the way are kept in the repository on purpose, because they are the interesting part for the class. See [How it was made](#how-it-was-made).

## What the original paper describes

FilmFinder lets you explore a film database without typing a query. It rests on three ideas:

- **Dynamic queries.** Sliders and buttons filter the data, and the display updates continuously while you drag, with no submit button.
- **Starfield display.** Every film is a point of light on a scatterplot (year across, popularity up, genre as colour), with zoom and details on demand.
- **Tight coupling.** Widgets only offer values that still produce results, so you cannot build an empty query. The Alphaslider is the device for this: it browses a long sorted list of names and can only land on names that still have films.

## What is built

- **Starfield:** year on X, popularity on Y, colour by genre. Zoom, pan, hover tooltip, click for a detail card.
- **Query widgets:** Year and Length range sliders, rating checkboxes (G, PG, PG-13, R, NR), genre buttons that double as the colour legend, and four **Alphasliders** (Title, Actor, Actress, Director).
- **Tight coupling:** thumbs and buttons are limited to values that still match something, given every other widget.
- **Detail card** with poster, cast and a photo for each person. Clicking a name searches for that person's films (the paper's "associative search").
- **Results list** in the side panel: the best-known films matching the current query, so everything can also be done from the keyboard.
- A standalone **Alphaslider demo** at `/alphaslider-demo.html` while the dev server runs.

### Two data sources

The app works with either of two datasets, and picks one when it starts.

|                    | Wikidata sample                                                       | Full IMDb + TMDB data                                                       |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Where              | `public/sample-data/`, **in the repository**                          | `public/data/`, built on your machine, **not committed**                    |
| Size               | about 4,400 well-known films, 1.6 MB                                  | about 49,000 films                                                          |
| Needs              | nothing                                                               | a free TMDB account, about 1.3 GB of downloads, an hour of fetching         |
| Licence            | Wikidata is CC0, so it can be shared                                  | IMDb (personal, non-commercial use) and TMDB terms: cannot be redistributed |
| Y axis             | popularity: number of Wikipedia language editions                     | average rating, or number of votes                                          |
| Certifications     | MPA rating where Wikidata has one (about half of films), otherwise NR | US certification from TMDB (about 40% of films), otherwise NR               |
| Posters and photos | few film posters; many people photos from Wikimedia Commons           | posters and photos for most films and people                                |

If `public/data/` exists the app uses it; otherwise it uses the sample. Add `?data=sample` to the address to force the sample. The footer of the side panel always says which data you are looking at.

### Where it differs from the papers

- The paper's Y axis is "popularity". IMDb has no such number, so with IMDb data Y is average rating, with a toggle for vote count. Wikidata has no rating at all, so with the sample Y is popularity (Wikipedia language editions), which is closer to the paper's wording.
- The data is real data from today, not the 1994 database. About 60% of films in the IMDb build have no US certification on TMDB and fall in an "NR" bucket, which the paper does not have.
- Each film is coloured by the first of its genres that is in the legend, and the genre buttons match that same genre. A film with several genres therefore appears under only one. Wikidata genres have no order, so for the sample the colour genre is chosen by a fixed priority (specific genres before Comedy and Drama). Animated and anime films are filed by Wikidata under their type, not a genre, so the sample counts that type as Animation.
- Stars are spread slightly within their year and rating, because the data gives whole years and few distinct ratings, and thousands of films would otherwise share one exact point.
- Alphasliders select **one name** at a time, as in the paper. They follow the paper's redesigned version: click to jump, a thumb with a coarse and a fine half, arrow buttons, and an index spaced by how many names start with each letter. A range of names is not built.
- Names are shown as "Last, First" using a simple rule (the last word is the surname), so some names, notably East Asian ones, file under the wrong word. People are identified by id, not by name: two different people called "John Smith" are two entries, and the alphaslider tells them apart by adding their best-known film.

## Running it

You need **Node 22 or newer** (developed on Node 24).

```sh
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). With a fresh clone this shows the **Wikidata sample**, and nothing else is needed.

### Using the full IMDb + TMDB data (optional)

This gives about 49,000 films, ratings, certifications and posters. It takes some setup.

**1. IMDb: no account needed.** IMDb publishes its datasets at https://datasets.imdbws.com/ and the script downloads them for you (about 1.3 GB, first run only). By using them you accept IMDb's conditions: personal, non-commercial use only, and no redistribution. Read them at https://developer.imdb.com/non-commercial-datasets/.

**2. TMDB: a free account and an API key.** TMDB supplies certifications, posters and people photos. The steps below are from memory of the site, and the form changes from time to time, so follow what it shows you:

1. Create an account at https://www.themoviedb.org/signup and confirm your email address.
2. Log in, open your profile menu, choose **Settings**, then **API** (https://www.themoviedb.org/settings/api).
3. Request an API key. Choose the **Developer** option, accept the terms, and fill in the form. A personal or educational, non-commercial use is what you want to describe. For the application URL you can give the address of your repository or `http://localhost`.
4. The API page then shows two credentials: an **API Key** (v3) and an **API Read Access Token** (v4). You need only one of them.
5. Copy the example file and paste your credential after the `=`, with no quotes or spaces:

   ```sh
   cp .env.example .env
   ```

   ```
   TMDB_API_KEY=your_v3_key
   TMDB_READ_ACCESS_TOKEN=your_v4_token
   ```

   `.env` is not committed. Never put a key anywhere that is.

**3. Build the data.**

```sh
npm run build-data      # downloads IMDb files, builds public/data/ (a few minutes)
npm run enrich          # fetches TMDB data (about 40 minutes, safe to interrupt and resume)
npm run build-data      # run again to merge the TMDB results
npm run dev
```

Try `npm run enrich -- --limit 200` first to check that your credential works. Until the enrich step is done, every film is "NR" and there are no posters or photos. TMDB asks for attribution: the app's footer already carries it.

### Rebuilding the Wikidata sample (optional)

```sh
npm run build-wikidata -- --min-sitelinks 30
```

This queries the public Wikidata service with small, polite requests and caches every response in `data/cache/wikidata/`, so an interrupted run resumes. It takes a while. A higher `--min-sitelinks` gives fewer, better-known films. Wikimedia asks programs to identify themselves: if you run this often, add a line to `.env` such as `WIKIDATA_USER_AGENT=FilmFinderClass/1.0 (your email address)`.

### Other commands

`npm test` (unit tests), `npm run lint`, `npm run build`, and `npm run bench` (times the query engine on synthetic data).

`npm run e2e` runs the browser tests (they drive your installed Google Chrome, start the dev server themselves, and use the Wikidata sample, so they work on a fresh clone). `E2E_DATA=full npm run e2e` runs them on your own IMDb build instead.

## How it was made

Read these in order:

1. [`DESIGN.md`](DESIGN.md): goals, a decision log (what was decided by the person, what was a default the model proposed), the data model and the query engine design.
2. [`PLAN.md`](PLAN.md): the work as milestones, each with a "done when" test. Status notes were updated as work went on, including what was _not_ verified.

The approach, and what it showed:

- **Settle decisions first and write them down.** Language, stack, scope and licensing went into a decision log before any code. Items the model chose by default are marked as provisional.
- **Keep the logic out of the interface.** The query engine, the Alphaslider's position-to-name mapping, hit testing and card placement are plain functions with unit tests. The engine is also checked against a naive `Array.filter` on random inputs and benchmarked against the paper's "under 100 ms" goal (a recompute at 50,000 films takes well under a millisecond).
- **A person must look at it.** The model cannot judge whether a slider feels right. Every milestone that has a visual "done when" was marked as unverified until the person had tried it.
- **Give the model the paper.** The first Alphaslider was built from the short FilmFinder paper plus the model's assumptions, and it worked but was confusing. Only after the separate Alphaslider paper was provided did it get the design right: proportional index, coarse and fine thumb zones, arrow buttons, "Last, First" names.
- **Licensing shapes the design.** The IMDb and TMDB data cannot be shared, which would have left the repository unable to run on its own. That led to a second data source (Wikidata, CC0) and to a data format that carries its own labels, so the interface adapts to whichever dataset it is given.

### Mistakes worth studying

These are real and were all caught by the person using the app, not by the tests:

- **The Alphaslider was built wrong.** It used equal-width letter segments, a vertical "micrometer" fine mode (which the Alphaslider paper tested and found confusing) and "First Last" names. It passed its tests and was still hard to use.
- **The genre buttons were inconsistent.** Switching a genre off left stars of that colour on screen, because the filter matched any of a film's genres while the colour showed only the first. Tests had checked the filter against its own definition, not against what the user sees.
- **Ratings could not be deselected.** Certifications were deferred to a later milestone and every film was "NR", so four of five checkboxes were disabled. The workaround looked like a bug.
- **A control that did not exist.** The model described narrowing to 1950-1979 with the Year slider before there was one. A year filter existed in the engine but had no widget.

The lesson for the class: an LLM can read a paper, write a lot of correct code quickly, and follow a plan, but it fills gaps in a specification with plausible guesses. The person's job is to supply the source, check the behaviour, and notice when a guess was wrong.

## Layout

```
DESIGN.md, PLAN.md      design decisions and milestone log
src/engine/             query engine, filters, alphaslider logic, hit testing (no React)
src/components/         starfield, widgets, detail card
src/store/              Zustand state and the query state
scripts/                data pipelines (IMDb, TMDB, Wikidata) and a benchmark
public/sample-data/     the Wikidata sample (committed)
public/data/            the full IMDb + TMDB data (built locally, not committed)
data/                   downloaded IMDb files and API caches (not committed)
```

## Data, credits and licences

- **Wikidata sample:** [Wikidata](https://www.wikidata.org/) data is released under CC0. People photos and film posters are files on [Wikimedia Commons](https://commons.wikimedia.org/), each under its own licence; the app loads them from Commons and does not store them.
- **Full data, films:** [IMDb non-commercial datasets](https://developer.imdb.com/non-commercial-datasets/), for personal, non-commercial use only. Do not redistribute the files.
- **Full data, certifications, posters, languages, countries, photos:** [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB.
- Based on the work of Christopher Ahlberg and Ben Shneiderman. The two papers are not included here because they are copyrighted; they are available from the ACM Digital Library:
  - Ahlberg, C. and Shneiderman, B. _Visual Information Seeking using the FilmFinder._ CHI '94 Conference Companion, 1994.
  - Ahlberg, C. and Shneiderman, B. _The Alphaslider: A Compact and Rapid Selector._ CHI '94, 1994.
- This is an independent reconstruction for teaching. It is not affiliated with the authors or their institution.
- **Code licence:** MIT, see [`LICENSE`](LICENSE). It covers the code in this repository only. The data, the images and the papers keep their own terms, as described above.

## Status

Milestones 0 to 7 of the plan are done: setup, data pipeline, query engine, starfield, basic widgets, Alphasliders, detail card and TMDB data. Afterwards came the Wikidata sample and the fixes from an outside code review (sliders that could not produce an empty query, people identified by id, load failures with retry, keyboard access to film selection), with browser tests. Milestone 8 is partly done: the browser tests exist, but the colour-blind check of the genre colours and a fuller performance pass (load time, memory) are not.
