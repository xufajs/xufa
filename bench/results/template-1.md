
Compiled once, then rendered (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 4.16M | 1.42M | 1.67M | 2.19M | 11.35M | 862.4k |
| list of 20 (each, if) | 123.5k | 69.6k | 74.2k | 39.1k | 109.4k | 46.2k |

Compiled and rendered each time (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 572.5k | 17.5k | 192.8k | 52.4k | 169.0k | 84.5k |
| list of 20 (each, if) | 78.7k | 5.5k | 48.9k | 12.5k | 57.0k | 24.9k |
