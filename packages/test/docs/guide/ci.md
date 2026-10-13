# CI and reports

What a run leaves for CI and for coding agents: reports in files, the failures to rerun, slices of the suite for parallel jobs, and exit codes that tell a broken test from a broken setup (see the [API reference](../api/cli.md)).

## Reports for CI and agents

`--reporter` takes a list (repeat it, or separate names with commas): one of `default`, `verbose` or `json` prints the run, and these write it, in `.xufa-test/`:

- `junit`: `junit.xml`, which most CI systems read. A flaky test passes, with its failed attempts as `flakyFailure` elements.
- `markdown`: `summary.md`, and a page per failed or flaky test in `failures/` with the error, its source line, every attempt, the test's console output and the command that reruns it. Written for people, and for coding agents fixing the failures.
- `github`: under GitHub Actions, an annotation on the line of each failure and the run's summary on the job's page. With no reporter configured, it is on there by itself, as in vitest.

```sh
npx xufa-test --reporter default,junit,markdown
```

A run clears the reports of the one before, except with `--last-failed`, which updates them: the pages of tests that pass now go, the others stay.

## Coding agents

The documentation ships in the package, as Markdown in `node_modules/@xufa/test/docs`, so an agent reads the version it runs, offline: `npx xufa-test guide` lists the topics, `npx xufa-test guide
          projects` prints one. `npx xufa-test init --agents` writes a skill (`.agents/skills/xufa-test/SKILL.md`, linked from `.claude/skills/xufa-test` for Claude Code, and named in `AGENTS.md` when there is one) that tells an agent how to run the tests, read a failure page, fix what failed and write AI steps; `@xufa/test-mcp` gives MCP clients tools for the same, and live sessions: an agent opens the app as the tests see it, acts on it, and asks which locator to write.

## Rerunning failures

Every run writes `.xufa-test/report.json`: every file and test with its result, and what still fails. `--last-failed` runs only that: the tests that failed, and the whole of each file that did not load.

```sh
npx xufa-test                  # 3 tests fail
npx xufa-test --last-failed    # runs those 3; fix them one by one
npx xufa-test --last-failed    # "No failed tests to rerun"
```

A failure is forgotten only when its test runs again and passes, or no longer exists: a run that leaves it out (a path, `-t`, `--shard`, `--bail`) keeps it for the next `--last-failed`. With no report yet, `--last-failed` runs every test. Add `.xufa-test/` to your `.gitignore`; `outputDir` moves it, and `outputDir: false` writes no report.

## Sharding

To spread a suite over several CI jobs, give each one a slice with `--shard <index>/<total>`, spelled as in Jest and Vitest, with the index from 1:

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx xufa-test --shard ${{ matrix.shard }}/4
```

Every job works out the slices on its own, from what all of them see alike: the paths and sizes of the test files. Each file goes to the slice with the fewest bytes so far, biggest files first, so slices are close in size and every file runs in exactly one of them. Durations of earlier runs would balance better, but each machine has its own, and jobs that disagree would skip files. A slice with no files fails, unless `--passWithNoTests` is given.
