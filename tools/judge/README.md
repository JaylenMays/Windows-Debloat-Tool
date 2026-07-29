# Visual judge loop

A closed feedback loop for driving AETHERIUM's visuals toward the AAA bar.
The point is that the standard lives outside the person doing the work.

## The loop

```
capture  ->  judge  ->  fix  ->  capture  ->  judge  ->  ...
```

1. **Capture** a deterministic shot sheet from the *real* game:

   ```sh
   # server must be up:  node tools/serve.mjs 8099 .
   node tools/judge/capture.mjs <round> [width] [height]
   # -> tools/judge/shots/round-<n>/NN-name.png + MANIFEST.json
   ```

   The framings are fixed across rounds so two rounds are directly comparable.
   Capture also records any console/page errors that occurred while shooting.

2. **Judge.** Spawn a subagent whose entire instruction is: follow
   `tools/judge/JUDGE.md` against `tools/judge/shots/round-<n>/`, and write its
   report to `tools/judge/reports/round-<n>.md`. The judge is a fresh agent with
   no memory of building the game and no stake in the outcome.

3. **Fix** the defects it ranked CRITICAL and MAJOR. Then re-capture and
   re-judge with the *same* rubric.

## Rules that make this meaningful

- **`JUDGE.md` is frozen.** It is committed so that any weakening between
  rounds is visible in `git log -p tools/judge/JUDGE.md`. Tightening the bar is
  allowed; loosening it to secure a PASS is not.
- **The judge's prompt is not editable per-round.** The spawn instruction only
  points at the rubric and the directory. Nothing round-specific is added that
  could bias it (no "note that X is already known", no "focus only on Y").
- **The default verdict is FAIL**, and any visible artifact caps the round at
  FAIL regardless of the other scores.
- **Reports are kept**, so the trajectory across rounds is auditable.

## Known limitation — state this whenever quoting a verdict

The sandbox blocks outbound image fetches (HTTP 403 through the proxy), so the
judge has **no reference screenshots on disk**. It compares our frames against
its own trained visual memory of Starfield / Elite Dangerous / No Man's Sky
rather than doing a side-by-side pixel comparison. That is a real weakening of
the original intent: the judgement is still independent and specific, but it is
not literally "looked at a Starfield screenshot, then looked at ours".

To close that gap on a machine with network access, drop reference PNGs into
`tools/judge/reference/` and add a line to the spawn instruction telling the
judge to read them first. Nothing else needs to change.

## Also note

Rendering here is CPU (SwiftShader) — correct output, but seconds per frame.
Captures take ~10 minutes. Nothing in the shot sheet depends on framerate, so
the images are representative even though the timings are not.
