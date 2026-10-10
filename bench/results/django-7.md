# Django vs xufa: examples/locallibrary

2026-10-10. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 198,195 | 17,269 (granian-wsgi) | **11.48x** | 1.00 ms | 15.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 37,638 | 1,760 (granian-wsgi) | **21.39x** | 4.00 ms | 56.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 16,254 | 1,208 (granian-wsgi) | **13.46x** | 7.00 ms | 128.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 9,427 | 1,157 (granian-wsgi) | **8.15x** | 12.0 ms | 104.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 16,355 | 983 (granian-wsgi) | **16.63x** | 8.00 ms | 114.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 8,527 | 715 (gunicorn-sync) | **11.92x** | 13.0 ms | 4928.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 5,426 | 662 (granian-wsgi) | **8.19x** | 27.0 ms | 186.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 198,195<br>0.00 ms / 1.00 ms<br>±8% | 6,673<br>2776.0 ms / 4844.0 ms<br>±3% | 4,878<br>12.0 ms / 23.0 ms<br>±1% | 17,269<br>2.00 ms / 15.0 ms<br>±0% | 1,168<br>54.0 ms / 66.0 ms<br>±3% |
| json | 37,638<br>1.00 ms / 4.00 ms<br>±8% | 1,519<br>2480.0 ms / 4949.0 ms<br>±1% | 1,293<br>47.0 ms / 76.0 ms<br>±1% | 1,760<br>37.0 ms / 56.0 ms<br>±1% | 643<br>98.0 ms / 125.0 ms<br>±4% |
| index | 16,254<br>3.00 ms / 7.00 ms<br>±37% ⚠ | 457<br>2928.0 ms / 4667.0 ms<br>±2% | 1,027<br>41.0 ms / 154.0 ms<br>±0% | 1,208<br>50.0 ms / 128.0 ms<br>±2% | 505<br>122.0 ms / 198.0 ms<br>±1% |
| books | 9,427<br>6.00 ms / 12.0 ms<br>±6% | 940<br>2540.0 ms / 5042.0 ms<br>±1% | 926<br>64.0 ms / 117.0 ms<br>±3% | 1,157<br>53.0 ms / 104.0 ms<br>±4% | 513<br>123.0 ms / 159.0 ms<br>±0% |
| book | 16,355<br>3.00 ms / 8.00 ms<br>±5% | 937<br>2531.0 ms / 4982.0 ms<br>±1% | 811<br>77.0 ms / 111.0 ms<br>±1% | 983<br>65.0 ms / 114.0 ms<br>±6% | 464<br>121.0 ms / 220.0 ms<br>±1% |
| mybooks | 8,527<br>6.00 ms / 13.0 ms<br>±3% | 715<br>2741.0 ms / 4928.0 ms<br>±5% | 572<br>109.0 ms / 170.0 ms<br>±1% | 658<br>94.0 ms / 136.0 ms<br>±3% | 344<br>182.0 ms / 263.0 ms<br>±2% |
| author-update | 5,426<br>10.0 ms / 27.0 ms<br>±3% | 427<br>2723.0 ms / 5087.0 ms<br>±4% | 587<br>100.0 ms / 194.0 ms<br>±2% | 662<br>86.0 ms / 186.0 ms<br>±4% | 344<br>179.0 ms / 233.0 ms<br>±1% |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 1001 | 338 | 362 | 442 | 607 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
