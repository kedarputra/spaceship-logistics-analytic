# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. They are committed, so a cloud session, a local session, and Sandcastle all see the same state.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Blocking is a `Blocked by:` line listing ticket numbers in the same feature (`01, 03`) or `<feature>/<NN>` across features
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- Use separate slugs for planning and for building, for example `.scratch/plan/` for the wayfinder map and `.scratch/mvp/` for implementation tickets

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## How Sandcastle uses it

`.sandcastle/tracker.mjs` is the bridge:

- `node .sandcastle/tracker.mjs list` prints, as JSON, the tickets whose status is `ready-for-agent` and whose blockers are all `done` or `resolved`. Sandcastle's implementer reads exactly this list.
- `node .sandcastle/tracker.mjs close <feature>/<NN> "<note>"` sets the status to `done` and appends the note under `## Comments`.
- `npm run tickets` shows every ticket and its state.

Wayfinder decision tickets never carry `ready-for-agent`, so Sandcastle never picks them up.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`. A decision that changes the build also gets an ADR in `docs/adr/`.
