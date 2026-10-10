# Django vs xufa: examples/locallibrary

2026-10-09. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.40.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 201,613 | 17,128 (granian-wsgi) | **11.77x** | 1.00 ms | 15.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 27,221 | 1,744 (granian-wsgi) | **15.61x** | 5.00 ms | 58.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 3,858 | 724 (granian-wsgi) | **5.33x** | 31.0 ms | 148.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 5,322 | 1,172 (granian-wsgi) | **4.54x** | 23.0 ms | 104.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 12,536 | 973 (granian-wsgi) | **12.88x** | 10.0 ms | 100.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 7,460 | 714 (gunicorn-sync) | **10.45x** | 15.0 ms | 4982.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 5,323 | 677 (granian-wsgi) | **7.87x** | 25.0 ms | 181.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 201,613<br>0.00 ms / 1.00 ms<br>±23% ⚠ | 6,634<br>2765.0 ms / 4849.0 ms<br>±9% | 4,793<br>12.0 ms / 28.0 ms<br>±6% | 17,128<br>2.00 ms / 15.0 ms<br>±2% | 1,189<br>52.0 ms / 67.0 ms<br>±5% |
| json | 27,221<br>2.00 ms / 5.00 ms<br>±23% ⚠ | 1,539<br>2501.0 ms / 4887.0 ms<br>±1% | 1,232<br>49.0 ms / 98.0 ms<br>±10% ⚠ | 1,744<br>37.0 ms / 58.0 ms<br>±5% | 644<br>96.0 ms / 131.0 ms<br>±5% |
| index | 3,858<br>15.0 ms / 31.0 ms<br>±13% ⚠ | 424<br>2568.0 ms / 4958.0 ms<br>±4% | 626<br>87.0 ms / 212.0 ms<br>±4% | 724<br>89.0 ms / 148.0 ms<br>±9% | 350<br>178.0 ms / 266.0 ms<br>±4% |
| books | 5,322<br>11.0 ms / 23.0 ms<br>±10% | 887<br>2643.0 ms / 4891.0 ms<br>±6% | 946<br>67.0 ms / 100.0 ms<br>±1% | 1,172<br>56.0 ms / 104.0 ms<br>±11% ⚠ | 508<br>122.0 ms / 186.0 ms<br>±8% |
| book | 12,536<br>4.00 ms / 10.0 ms<br>±22% ⚠ | 938<br>2603.0 ms / 4932.0 ms<br>±0% | 822<br>75.0 ms / 123.0 ms<br>±2% | 973<br>62.0 ms / 100.0 ms<br>±2% | 471<br>132.0 ms / 181.0 ms<br>±1% |
| mybooks | 7,460<br>7.00 ms / 15.0 ms<br>±3% | 714<br>2501.0 ms / 4982.0 ms<br>±2% | 585<br>110.0 ms / 205.0 ms<br>±9% | 670<br>89.0 ms / 152.0 ms<br>±2% | 338<br>183.0 ms / 245.0 ms<br>±5% |
| author-update | 5,323<br>10.0 ms / 25.0 ms<br>±3% | 432<br>2505.0 ms / 5058.0 ms<br>±5% | 584<br>109.0 ms / 215.0 ms<br>±6% | 677<br>80.0 ms / 181.0 ms<br>±3% | 332<br>190.0 ms / 267.0 ms<br>±16% ⚠ |

## Memory (resident, all processes, MB, after the scenarios)

| xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| ---: | ---: | ---: | ---: | ---: |
| 993 | 335 | 362 | 443 | 601 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
