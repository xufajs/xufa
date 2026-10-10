# Django vs xufa: examples/locallibrary

2026-10-10. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 186,547 | 17,004 (granian-wsgi) | **10.97x** | 1.00 ms | 16.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 38,614 | 1,742 (granian-wsgi) | **22.17x** | 3.00 ms | 65.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 15,912 | 1,194 (granian-wsgi) | **13.33x** | 7.00 ms | 133.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 9,100 | 1,151 (granian-wsgi) | **7.90x** | 12.0 ms | 102.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 16,001 | 973 (granian-wsgi) | **16.45x** | 8.00 ms | 98.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 8,456 | 712 (gunicorn-sync) | **11.87x** | 13.0 ms | 4977.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 5,455 | 667 (granian-wsgi) | **8.18x** | 28.0 ms | 185.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 186,547<br>0.00 ms / 1.00 ms<br>±12% ⚠ | 6,695<br>2735.0 ms / 4881.0 ms<br>±8% | 4,906<br>12.0 ms / 23.0 ms<br>±1% | 17,004<br>2.00 ms / 16.0 ms<br>±2% | 1,155<br>52.0 ms / 73.0 ms<br>±1% |
| json | 38,614<br>1.00 ms / 3.00 ms<br>±22% ⚠ | 1,481<br>2474.0 ms / 4965.0 ms<br>±8% | 1,283<br>47.0 ms / 74.0 ms<br>±1% | 1,742<br>33.0 ms / 65.0 ms<br>±2% | 641<br>99.0 ms / 135.0 ms<br>±3% |
| index | 15,912<br>3.00 ms / 7.00 ms<br>±17% ⚠ | 449<br>2691.0 ms / 4608.0 ms<br>±3% | 1,020<br>63.0 ms / 151.0 ms<br>±2% | 1,194<br>51.0 ms / 133.0 ms<br>±3% | 495<br>130.0 ms / 220.0 ms<br>±5% |
| books | 9,100<br>6.00 ms / 12.0 ms<br>±29% ⚠ | 927<br>2567.0 ms / 5059.0 ms<br>±2% | 905<br>71.0 ms / 116.0 ms<br>±5% | 1,151<br>52.0 ms / 102.0 ms<br>±2% | 510<br>123.0 ms / 160.0 ms<br>±2% |
| book | 16,001<br>3.00 ms / 8.00 ms<br>±3% | 921<br>2792.0 ms / 4944.0 ms<br>±9% | 808<br>76.0 ms / 113.0 ms<br>±2% | 973<br>60.0 ms / 98.0 ms<br>±1% | 461<br>137.0 ms / 180.0 ms<br>±1% |
| mybooks | 8,456<br>7.00 ms / 13.0 ms<br>±15% ⚠ | 712<br>2782.0 ms / 4977.0 ms<br>±6% | 568<br>118.0 ms / 176.0 ms<br>±1% | 655<br>94.0 ms / 150.0 ms<br>±1% | 335<br>186.0 ms / 255.0 ms<br>±2% |
| author-update | 5,455<br>10.0 ms / 28.0 ms<br>±11% ⚠ | 431<br>2612.0 ms / 4998.0 ms<br>±5% | 583<br>117.0 ms / 204.0 ms<br>±2% | 667<br>91.0 ms / 185.0 ms<br>±2% | 338<br>184.0 ms / 238.0 ms<br>±2% |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 984 | 337 | 361 | 442 | 605 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
