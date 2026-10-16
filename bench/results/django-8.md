# Django vs xufa: examples/locallibrary

2026-10-14. 13th Gen Intel(R) Core(TM) i7-13700H, 20 cores, Linux 6.18.54.1-microsoft-standard-WSL2. 4 processes for each side, 64 connections (autocannon in 4 threads, no pipelining), 3 rounds of 10 s (after 3 s of warm-up), medians.

Node.js v24.21.0; Python 3.14.4, Django 6.1.2, gunicorn 26.2.0, granian 2.8.4, uvicorn 0.54.0, psycopg 3.3.6; PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).

## xufa against the fastest Django of each scenario

| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hello: Plain text (the framework alone) | 177,792 | 15,634 (granian-wsgi) | **11.37x** | 1.00 ms | 19.0 ms | 13 / 13 |
| json: A book as JSON (2 queries) | 33,828 | 1,655 (granian-wsgi) | **20.44x** | 4.00 ms | 61.0 ms | 172 / 188 |
| index: Home page: 4 counts, the visits in the session (saved), template | 12,230 | 1,131 (granian-wsgi) | **10.82x** | 9.00 ms | 140.0 ms | 2,415 / 2,115 |
| books: Book list: a page of 10 with their authors, paginated, template | 8,042 | 1,061 (granian-wsgi) | **7.58x** | 15.0 ms | 114.0 ms | 2,531 / 2,682 |
| book: Book detail: author, language, genres, copies, template | 14,006 | 892 (granian-wsgi) | **15.70x** | 9.00 ms | 127.0 ms | 2,653 / 2,388 |
| mybooks: Loans of the user: logged in, a list with its books | 7,484 | 646 (gunicorn-sync) | **11.59x** | 15.0 ms | 4901.0 ms | 3,085 / 3,231 |
| author-update: Edit an author: form POST with CSRF, validation, UPDATE, redirect | 5,294 | 611 (granian-wsgi) | **8.67x** | 27.0 ms | 199.0 ms | 0 / 0 |

## Every server (req/s, p50 / p99, spread of the rounds)

| Scenario | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello | 177,792<br>0.00 ms / 1.00 ms<br>±26% ⚠ | 5,944<br>2748.0 ms / 4851.0 ms<br>±11% ⚠ | 4,461<br>13.0 ms / 26.0 ms<br>±16% ⚠ | 15,634<br>3.00 ms / 19.0 ms<br>±4% | 1,039<br>61.0 ms / 90.0 ms<br>±23% ⚠ |
| json | 33,828<br>1.00 ms / 4.00 ms<br>±38% ⚠ | 1,280<br>2692.0 ms / 4847.0 ms<br>±22% ⚠ | 1,186<br>48.0 ms / 98.0 ms<br>±15% ⚠ | 1,655<br>37.0 ms / 61.0 ms<br>±6% | 594<br>106.0 ms / 182.0 ms<br>±30% ⚠ |
| index | 12,230<br>4.00 ms / 9.00 ms<br>±25% ⚠ | 446<br>2678.0 ms / 4698.0 ms<br>±7% | 938<br>42.0 ms / 183.0 ms<br>±12% ⚠ | 1,131<br>54.0 ms / 140.0 ms<br>±6% | 465<br>134.0 ms / 225.0 ms<br>±32% ⚠ |
| books | 8,042<br>7.00 ms / 15.0 ms<br>±43% ⚠ | 828<br>2492.0 ms / 4968.0 ms<br>±8% | 868<br>72.0 ms / 123.0 ms<br>±4% | 1,061<br>57.0 ms / 114.0 ms<br>±9% | 465<br>132.0 ms / 200.0 ms<br>±20% ⚠ |
| book | 14,006<br>4.00 ms / 9.00 ms<br>±15% ⚠ | 848<br>2499.0 ms / 4906.0 ms<br>±4% | 748<br>79.0 ms / 159.0 ms<br>±7% | 892<br>73.0 ms / 127.0 ms<br>±24% ⚠ | 422<br>149.0 ms / 249.0 ms<br>±45% ⚠ |
| mybooks | 7,484<br>8.00 ms / 15.0 ms<br>±28% ⚠ | 646<br>2576.0 ms / 4901.0 ms<br>±5% | 534<br>118.0 ms / 183.0 ms<br>±2% | 606<br>107.0 ms / 160.0 ms<br>±19% ⚠ | 317<br>199.0 ms / 368.0 ms<br>±42% ⚠ |
| author-update | 5,294<br>10.0 ms / 27.0 ms<br>±7% | 415<br>2793.0 ms / 5066.0 ms<br>±3% | 543<br>118.0 ms / 222.0 ms<br>±5% | 611<br>97.0 ms / 199.0 ms<br>±21% ⚠ | 320<br>194.0 ms / 274.0 ms<br>±37% ⚠ |

## Memory (all processes, MB, after the scenarios)

rss: the resident size of each process added up (the pages of files they share counted once by process); pss: each shared page divided among the processes that map it, what the server takes of the machine.

| | xufa | gunicorn-sync | gunicorn-gthread | granian-wsgi | uvicorn-asgi |
| --- | ---: | ---: | ---: | ---: | ---: |
| rss | 1030 | 337 | 362 | 440 | 590 |
| pss | 819 | 260 | 284 | 337 | 504 |

## How

- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa (examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.
- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent connections, no static files middleware, no request log; the lists load their relations as the port does (select_related/prefetch_related; the tutorial's views make a query per book).
- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.
- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark (bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).
- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.
