# Django vs xufa: examples/locallibrary

2026-10-09. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 153,393 | 16,943 (granian-wsgi) | **9.05x** | 1.00 ms | 16.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 11,735 | 1,750 (granian-wsgi) | **6.71x** | 10.0 ms | 56.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 3,092 | 734 (granian-wsgi) | **4.21x** | 40.0 ms | 171.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 3,069 | 1,125 (granian-wsgi) | **2.73x** | 35.0 ms | 96.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 6,062 | 968 (granian-wsgi) | **6.26x** | 17.0 ms | 127.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 4,021 | 703 (gunicorn-sync) | **5.72x** | 26.0 ms | 5082.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 4,158 | 657 (granian-wsgi) | **6.33x** | 30.0 ms | 191.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 153,393<br>0.00 ms / 1.00 ms<br>±18% ⚠ | 6,557<br>2633.0 ms / 4921.0 ms<br>±7% | 4,289<br>12.0 ms / 29.0 ms<br>±12% ⚠ | 16,943<br>2.00 ms / 16.0 ms<br>±8% | 1,191<br>53.0 ms / 67.0 ms<br>±3% |
| json | 11,735<br>5.00 ms / 10.0 ms<br>±50% ⚠ | 1,520<br>2477.0 ms / 4877.0 ms<br>±10% | 1,204<br>46.0 ms / 83.0 ms<br>±3% | 1,750<br>36.0 ms / 56.0 ms<br>±3% | 648<br>90.0 ms / 157.0 ms<br>±2% |
| index | 3,092<br>19.0 ms / 40.0 ms<br>±8% | 408<br>2610.0 ms / 5017.0 ms<br>±8% | 584<br>111.0 ms / 197.0 ms<br>±6% | 734<br>91.0 ms / 171.0 ms<br>±11% ⚠ | 352<br>169.0 ms / 282.0 ms<br>±4% |
| books | 3,069<br>20.0 ms / 35.0 ms<br>±10% | 775<br>2561.0 ms / 4966.0 ms<br>±7% | 827<br>73.0 ms / 157.0 ms<br>±8% | 1,125<br>55.0 ms / 96.0 ms<br>±3% | 502<br>110.0 ms / 207.0 ms<br>±0% |
| book | 6,062<br>9.00 ms / 17.0 ms<br>±12% ⚠ | 875<br>2557.0 ms / 5062.0 ms<br>±21% ⚠ | 784<br>75.0 ms / 136.0 ms<br>±1% | 968<br>61.0 ms / 127.0 ms<br>±6% | 471<br>133.0 ms / 194.0 ms<br>±4% |
| mybooks | 4,021<br>15.0 ms / 26.0 ms<br>±12% ⚠ | 703<br>2775.0 ms / 5082.0 ms<br>±6% | 566<br>107.0 ms / 181.0 ms<br>±5% | 663<br>101.0 ms / 172.0 ms<br>±10% | 346<br>182.0 ms / 234.0 ms<br>±3% |
| author-update | 4,158<br>13.0 ms / 30.0 ms<br>±9% | 407<br>2540.0 ms / 4965.0 ms<br>±9% | 572<br>111.0 ms / 193.0 ms<br>±4% | 657<br>91.0 ms / 191.0 ms<br>±7% | 337<br>192.0 ms / 249.0 ms<br>±10% |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 1178 | 336 | 361 | 445 | 610 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
