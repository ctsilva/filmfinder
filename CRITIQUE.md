# FilmFinder implementation critique

Reviewed October 16, 2026.

## Overall assessment

FilmFinder is a strong implementation of the proposed architecture and a useful teaching artifact. The separation between the data pipeline, query engine, and interface makes the code understandable and testable. The Wikidata sample gives a fresh clone a usable starting point without requiring the full data pipeline.

The remaining work should focus on interaction correctness and end-to-end verification. In particular, the implementation does not yet fully uphold the claim that tightly coupled widgets prevent empty queries, and person identity is lost when building the search indexes.

## Scope and verification

This review inspected the source and project documentation and ran the existing checks:

- `npm test`: all 134 tests passed across 14 test files.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking and the production bundle.

The application was not visually inspected or exercised in a browser during this review. Starting the local server failed with an environment permission error when binding to `127.0.0.1:5173`, and no existing browser tab was available. The findings below are based on source inspection; responsiveness, appearance, and interaction feel remain unverified. Passing unit tests does not establish those qualities.

## What works well

### Clear architectural boundaries

The query engine has no React dependency. Data preparation happens separately from browser interaction, and the interface consumes a common schema across data sources. These boundaries make it practical to test query semantics independently and to change rendering without replacing the data model.

### Correct foundation for tight coupling

`QueryEngine.maskExcluding()` computes the films matching every filter except the widget's own. The alphaslider uses that rule through `validNames()`. This resolves the earlier design ambiguity that could have restricted a person slider to its currently selected person.

### Explicit alphaslider behavior

The component defines coarse and fine dragging, arrow-button repetition, keyboard navigation, and a clear action. The standalone demo is useful for evaluating this unusual control in isolation. These are meaningful implementation details, although their usability still needs browser observation.

### A deliberate response to overlapping points

Stable jitter separates films with identical year and rating coordinates. This addresses the earlier assumption that zoom alone would separate coincident points. The README also explains the positional adjustment rather than presenting it as exact data placement.

### Useful documentation for the class

The README records design changes, known data gaps, and mistakes that survived unit testing. That history supports the project's teaching purpose: showing where reproducing a paper requires interpretation, user feedback, and verification beyond code generation.

## Findings to address

### 1. Range sliders can still create empty queries

**Priority: high.** See [RangeSlider.tsx](src/components/RangeSlider.tsx), particularly the two input change handlers.

The minimum thumb is constrained by the available minimum and the current maximum thumb, but not by the available maximum. The maximum thumb has the inverse problem.

For example, suppose the other filters leave only films from 1980–1990 while the year slider still spans its full range. The minimum thumb can move to 2000, producing zero results. This contradicts the central claim that the widgets only offer values that leave matching films.

Clamping both thumbs to the available extrema is necessary but insufficient. If the remaining films occur only in 1980 and 1990, a range of 1985–1986 is still empty even though it lies within those extrema.

**Recommendation:** define range updates in terms of the values actually present under the other filters. Either prevent or snap an update that would leave no matching films, or explicitly relax the no-empty-query promise and provide a clear recovery path. Preserve the existing end-stop semantics when doing this.

**Verification:** test both movement beyond the available extrema and movement into a gap between available values. Include browser coverage of the actual input handlers, not only engine-level range filtering.

### 2. Person indexes merge distinct people with the same name

**Priority: high.** See [pipeline.ts](scripts/lib/pipeline.ts), [schema.ts](src/engine/schema.ts), and `selectPerson()` in [useApp.ts](src/store/useApp.ts).

The pipeline initially has IMDb person IDs, but converts credits into display names and builds an inverted index keyed by those names. Distinct people with identical display names therefore share a filmography. The detail-card search also resolves a person by name rather than identity.

This is a correctness issue: clicking a person can return another person's films. Name-keyed photo lookup has the same ambiguity.

**Recommendation:** preserve source-qualified person IDs throughout the pipeline, people indexes, credits, and selection state. Treat names as display labels. Provide a disambiguating label when names collide.

**Verification:** use a fixture containing two distinct person IDs with the same display name and separate films. Confirm that selecting either person returns only the appropriate filmography.

### 3. Failed secondary data loads remain in a loading state

**Priority: medium.** See `loadPeople()` and `loadCredits()` in [useApp.ts](src/store/useApp.ts), plus [AlphaSliders.tsx](src/components/AlphaSliders.tsx) and [DetailCard.tsx](src/components/DetailCard.tsx).

Failures fetching people or credits are logged to the console without updating an error state visible to the user. The associated interface can continue displaying “loading…” indefinitely.

**Recommendation:** give each secondary resource explicit loading, ready, and error states, with a retry action. Keep the already usable parts of the application available when one resource fails.

**Verification:** simulate failed requests for each resource and confirm that the interface explains the failure and can recover after a successful retry.

### 4. Keyboard access does not extend to film selection

**Priority: medium.** See [Starfield.tsx](src/components/Starfield.tsx).

The alphasliders have keyboard interaction, but the canvas provides no keyboard route to choose a film and open its detail card. Users who can operate the filters without a pointer cannot complete the exploration workflow.

**Recommendation:** add a compact, keyboard-accessible results list synchronized with the current query and selected film, or another equivalent selection mechanism. Define focus behavior when opening and closing details. A results list would also help users inspect dense clusters.

**Verification:** complete filtering, film selection, detail inspection, associative search, and dismissal using only the keyboard.

## Recommended next steps

1. Fix range-slider empty-result behavior and preserve person identities.
2. Add visible secondary-loading failures and recovery.
3. Add keyboard access to film selection and details.
4. Add a browser test covering filter → select film → inspect details → follow person → reset.
5. Observe the alphaslider and dense starfield in a real browser, using both the sample and full datasets. Measure input-to-paint latency, including valid-value computation and rendering, rather than relying only on the engine benchmark.

The implementation has a sound foundation. The next milestone should demonstrate that the complete interaction behaves as promised, including edge cases and recovery, before expanding the feature set.
