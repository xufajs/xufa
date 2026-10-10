# Django vs xufa: examples/locallibrary

2026-10-10. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 184,593 | 15,862 (granian-wsgi) | **11.64x** | 1.00 ms | 15.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 24,336 | 1,653 (granian-wsgi) | **14.72x** | 6.00 ms | 76.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 11,218 | 1,119 (granian-wsgi) | **10.02x** | 11.0 ms | 117.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 8,937 | 1,003 (granian-wsgi) | **8.91x** | 13.0 ms | 122.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 13,362 | 868 (gunicorn-sync) | **15.40x** | 10.0 ms | 5196.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 7,088 | 666 (gunicorn-sync) | **10.65x** | 17.0 ms | 5057.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 5,124 | 600 (granian-wsgi) | **8.54x** | 25.0 ms | 216.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 184,593<br>0.00 ms / 1.00 ms<br>±49% ⚠ | 6,447<br>2477.0 ms / 4977.0 ms<br>±13% ⚠ | 4,689<br>11.0 ms / 25.0 ms<br>±27% ⚠ | 15,862<br>2.00 ms / 15.0 ms<br>±8% | 1,135<br>54.0 ms / 77.0 ms<br>±16% ⚠ |
| json | 24,336<br>2.00 ms / 6.00 ms<br>±97% ⚠ | 1,407<br>2784.0 ms / 4815.0 ms<br>±32% ⚠ | 1,293<br>47.0 ms / 91.0 ms<br>±21% ⚠ | 1,653<br>34.0 ms / 76.0 ms<br>±8% | 492<br>122.0 ms / 217.0 ms<br>±26% ⚠ |
| index | 11,218<br>5.00 ms / 11.0 ms<br>±12% ⚠ | 450<br>2808.0 ms / 4706.0 ms<br>±4% | 975<br>52.0 ms / 152.0 ms<br>±22% ⚠ | 1,119<br>53.0 ms / 117.0 ms<br>±14% ⚠ | 422<br>141.0 ms / 287.0 ms<br>±18% ⚠ |
| books | 8,937<br>6.00 ms / 13.0 ms<br>±42% ⚠ | 826<br>2774.0 ms / 4990.0 ms<br>±2% | 896<br>59.0 ms / 123.0 ms<br>±17% ⚠ | 1,003<br>56.0 ms / 122.0 ms<br>±16% ⚠ | 427<br>144.0 ms / 238.0 ms<br>±11% ⚠ |
| book | 13,362<br>4.00 ms / 10.0 ms<br>±34% ⚠ | 868<br>2323.0 ms / 5196.0 ms<br>±16% ⚠ | 768<br>82.0 ms / 144.0 ms<br>±19% ⚠ | 867<br>68.0 ms / 134.0 ms<br>±8% | 396<br>155.0 ms / 275.0 ms<br>±7% |
| mybooks | 7,088<br>8.00 ms / 17.0 ms<br>±27% ⚠ | 666<br>2520.0 ms / 5057.0 ms<br>±19% ⚠ | 499<br>118.0 ms / 249.0 ms<br>±11% ⚠ | 629<br>98.0 ms / 149.0 ms<br>±3% | 283<br>199.0 ms / 491.0 ms<br>±8% |
| author-update | 5,124<br>11.0 ms / 25.0 ms<br>±13% ⚠ | 423<br>2714.0 ms / 5025.0 ms<br>±13% ⚠ | 515<br>125.0 ms / 237.0 ms<br>±20% ⚠ | 600<br>104.0 ms / 216.0 ms<br>±19% ⚠ | 303<br>213.0 ms / 325.0 ms<br>±12% ⚠ |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 1008 | 337 | 361 | 447 | 588 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
