# bench-linux

Runs a benchmark of `bench/` in the Linux of WSL, from Windows. On Linux the loopback is fast, so the cost of the
frameworks shows (on Windows the socket takes most of the time of a small response), and it is where servers run.

```sh
pnpm bench:linux inproc --rounds 5 --duration 2 --out results/inproc-linux-3
pnpm bench:linux run --duration 6 --warmup 2 --out results/full-linux-3
pnpm bench:linux --distro Debian micro/router.js
```

Each run:

1. installs Node.js for Linux, of the version running the command, in `~/node-<version>` of that Linux (once);
2. copies the working tree of the repository (changes not committed too, without `node_modules` nor `.git`) to
   `~/xufa`, and installs its dependencies there when `pnpm-lock.yaml` changed (the `node_modules` of Windows do not
   work in Linux);
3. runs `node bench/<script> <options>` there;
4. with `--out`, copies the report (`.md` and `.json`) back to `bench/results`.

It needs WSL with a distribution (`Ubuntu` unless `--distro` says another) that has `curl` and access to the network
for the first run. Nothing is installed outside the home of that Linux: removing `~/node-<version>` and `~/xufa` undoes
it.

The machine is shared with Windows: close what uses it while the benchmark runs, and read the ⚠ of the reports.
