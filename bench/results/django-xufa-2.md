# Django vs xufa: examples/locallibrary

2026-10-09. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa |
| --- | ---: |
| hello | 181,491<br>0.00 ms / 1.00 ms<br>±53% ⚠ |
| json | 16,272<br>3.00 ms / 7.00 ms<br>±62% ⚠ |
| index | 4,437<br>13.0 ms / 30.0 ms<br>±7% |
| books | 4,388<br>14.0 ms / 28.0 ms<br>±16% ⚠ |
| book | 8,425<br>6.00 ms / 14.0 ms<br>±24% ⚠ |
| mybooks | 5,212<br>11.0 ms / 24.0 ms<br>±50% ⚠ |
| author-update | 4,669<br>11.0 ms / 28.0 ms<br>±11% ⚠ |

## Memory (resident, all processes, MB, after the scenarios)

| xufa |
| ---: |
| — |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
