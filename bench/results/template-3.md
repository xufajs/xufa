
Compiled once, then rendered (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 13.07M | 1.29M | 1.51M | 2.05M | 10.63M | 778.2k |
| list of 20 (each, if) | 224.4k | 64.3k | 69.5k | 38.0k | 106.3k | 43.7k |

Compiled and rendered each time (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 627.5k | 17.8k | 194.1k | 54.2k | 173.5k | 84.0k |
| list of 20 (each, if) | 98.7k | 5.5k | 48.4k | 12.4k | 55.8k | 24.0k |
