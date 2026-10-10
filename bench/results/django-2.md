# Django vs xufa: examples/locallibrary

2026-10-09. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 197,965 | 17,065 (granian-wsgi) | **11.60x** | 1.00 ms | 15.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 11,678 | 1,752 (granian-wsgi) | **6.67x** | 11.0 ms | 63.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 3,836 | 720 (granian-wsgi) | **5.33x** | 31.0 ms | 175.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 3,416 | 1,103 (granian-wsgi) | **3.10x** | 35.0 ms | 108.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 7,657 | 989 (granian-wsgi) | **7.74x** | 15.0 ms | 95.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 4,983 | 666 (granian-wsgi) | **7.48x** | 22.0 ms | 159.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 4,589 | 663 (granian-wsgi) | **6.92x** | 27.0 ms | 190.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 197,965<br>0.00 ms / 1.00 ms<br>±7% | 6,140<br>2777.0 ms / 4999.0 ms<br>±70% ⚠ | 3,825<br>15.0 ms / 28.0 ms<br>±34% ⚠ | 17,065<br>2.00 ms / 15.0 ms<br>±53% ⚠ | 1,172<br>54.0 ms / 68.0 ms<br>±31% ⚠ |
| json | 11,678<br>4.00 ms / 11.0 ms<br>±49% ⚠ | 1,408<br>2760.0 ms / 4893.0 ms<br>±37% ⚠ | 1,154<br>54.0 ms / 86.0 ms<br>±28% ⚠ | 1,752<br>35.0 ms / 63.0 ms<br>±41% ⚠ | 630<br>100.0 ms / 149.0 ms<br>±18% ⚠ |
| index | 3,836<br>15.0 ms / 31.0 ms<br>±31% ⚠ | 393<br>2602.0 ms / 5001.0 ms<br>±20% ⚠ | 553<br>109.0 ms / 195.0 ms<br>±43% ⚠ | 720<br>86.0 ms / 175.0 ms<br>±30% ⚠ | 310<br>198.0 ms / 325.0 ms<br>±23% ⚠ |
| books | 3,416<br>18.0 ms / 35.0 ms<br>±47% ⚠ | 711<br>2541.0 ms / 5025.0 ms<br>±40% ⚠ | 884<br>71.0 ms / 136.0 ms<br>±33% ⚠ | 1,103<br>54.0 ms / 108.0 ms<br>±23% ⚠ | 500<br>129.0 ms / 191.0 ms<br>±30% ⚠ |
| book | 7,657<br>7.00 ms / 15.0 ms<br>±58% ⚠ | 845<br>2654.0 ms / 4995.0 ms<br>±47% ⚠ | 814<br>81.0 ms / 111.0 ms<br>±30% ⚠ | 989<br>67.0 ms / 95.0 ms<br>±42% ⚠ | 472<br>137.0 ms / 231.0 ms<br>±23% ⚠ |
| mybooks | 4,983<br>11.0 ms / 22.0 ms<br>±67% ⚠ | 647<br>2507.0 ms / 4948.0 ms<br>±48% ⚠ | 577<br>102.0 ms / 206.0 ms<br>±41% ⚠ | 666<br>93.0 ms / 159.0 ms<br>±22% ⚠ | 339<br>181.0 ms / 271.0 ms<br>±11% ⚠ |
| author-update | 4,589<br>13.0 ms / 27.0 ms<br>±49% ⚠ | 413<br>2541.0 ms / 4916.0 ms<br>±19% ⚠ | 581<br>106.0 ms / 197.0 ms<br>±46% ⚠ | 663<br>93.0 ms / 190.0 ms<br>±22% ⚠ | 349<br>181.0 ms / 247.0 ms<br>±6% |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 1192 | 335 | 361 | 441 | 600 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
