# Django vs xufa: examples/locallibrary

2026-10-10. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa |
| --- | ---: |
| hello | 95,091<br>0.00 ms / 2.00 ms<br>±72% ⚠ |
| json | 13,769<br>3.00 ms / 17.0 ms<br>±15% ⚠ |
| index | 5,313<br>10.0 ms / 48.0 ms<br>±28% ⚠ |
| books | 3,778<br>14.0 ms / 69.0 ms<br>±58% ⚠ |
| book | 5,420<br>9.00 ms / 60.0 ms<br>±32% ⚠ |
| mybooks | 3,622<br>14.0 ms / 87.0 ms<br>±25% ⚠ |
| author-update | 1,813<br>23.0 ms / 195.0 ms<br>±203% ⚠ |

## Memory (all processes, MB, after the scenarios)

rss: the resident size of each process added up (the pages of files they share counted once by process); pss: each shared page divided among the processes that map it, what the server takes of the machine.

| | xufa |
| --- | ---: |
| rss | 973 |
| pss | 762 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
