# Django vs xufa: examples/locallibrary

2026-10-09. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 200,349 | 17,144 (granian-wsgi) | **11.69x** | 1.00 ms | 16.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 27,419 | 1,716 (granian-wsgi) | **15.98x** | 5.00 ms | 62.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 5,864 | 1,167 (granian-wsgi) | **5.02x** | 22.0 ms | 132.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 5,085 | 1,170 (granian-wsgi) | **4.34x** | 24.0 ms | 100.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 11,167 | 966 (granian-wsgi) | **11.56x** | 11.0 ms | 106.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 6,608 | 651 (gunicorn-sync) | **10.15x** | 17.0 ms | 4911.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 4,885 | 628 (granian-wsgi) | **7.78x** | 30.0 ms | 201.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 200,349<br>0.00 ms / 1.00 ms<br>±8% | 5,824<br>2669.0 ms / 4955.0 ms<br>±18% ⚠ | 4,792<br>12.0 ms / 23.0 ms<br>±8% | 17,144<br>3.00 ms / 16.0 ms<br>±8% | 1,150<br>53.0 ms / 96.0 ms<br>±9% |
| json | 27,419<br>2.00 ms / 5.00 ms<br>±7% | 1,335<br>2618.0 ms / 4711.0 ms<br>±16% ⚠ | 1,286<br>42.0 ms / 103.0 ms<br>±12% ⚠ | 1,716<br>36.0 ms / 62.0 ms<br>±3% | 617<br>101.0 ms / 137.0 ms<br>±7% |
| index | 5,864<br>10.0 ms / 22.0 ms<br>±11% ⚠ | 448<br>2884.0 ms / 4728.0 ms<br>±8% | 1,021<br>52.0 ms / 144.0 ms<br>±10% ⚠ | 1,167<br>50.0 ms / 132.0 ms<br>±21% ⚠ | 474<br>131.0 ms / 236.0 ms<br>±1% |
| books | 5,085<br>11.0 ms / 24.0 ms<br>±11% ⚠ | 762<br>2454.0 ms / 5000.0 ms<br>±31% ⚠ | 921<br>67.0 ms / 114.0 ms<br>±6% | 1,170<br>52.0 ms / 100.0 ms<br>±1% | 442<br>139.0 ms / 208.0 ms<br>±14% ⚠ |
| book | 11,167<br>5.00 ms / 11.0 ms<br>±8% | 861<br>2397.0 ms / 5159.0 ms<br>±9% | 806<br>76.0 ms / 125.0 ms<br>±9% | 966<br>64.0 ms / 106.0 ms<br>±2% | 444<br>137.0 ms / 207.0 ms<br>±7% |
| mybooks | 6,608<br>9.00 ms / 17.0 ms<br>±15% ⚠ | 651<br>2700.0 ms / 4911.0 ms<br>±25% ⚠ | 562<br>87.0 ms / 243.0 ms<br>±13% ⚠ | 590<br>104.0 ms / 177.0 ms<br>±11% ⚠ | 318<br>198.0 ms / 274.0 ms<br>±6% |
| author-update | 4,885<br>11.0 ms / 30.0 ms<br>±8% | 403<br>2860.0 ms / 5049.0 ms<br>±9% | 584<br>100.0 ms / 212.0 ms<br>±6% | 628<br>103.0 ms / 201.0 ms<br>±12% ⚠ | 339<br>182.0 ms / 279.0 ms<br>±6% |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 1003 | 337 | 360 | 442 | 601 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
