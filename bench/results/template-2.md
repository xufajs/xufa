
Compiled once, then rendered (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 8.56M | 1.40M | 1.69M | 2.30M | 11.62M | 867.0k |
| list of 20 (each, if) | 171.8k | 70.0k | 75.4k | 40.7k | 114.5k | 46.8k |

Compiled and rendered each time (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 666.1k | 18.7k | 201.6k | 55.9k | 175.8k | 86.1k |
| list of 20 (each, if) | 95.4k | 5.5k | 49.0k | 12.4k | 56.8k | 24.8k |
