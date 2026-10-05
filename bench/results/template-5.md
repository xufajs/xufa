
Compiled once, then rendered (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 14.07M | 1.41M | 1.65M | 2.15M | 11.59M | 850.5k |
| list of 20 (each, if) | 239.7k | 68.8k | 73.6k | 40.2k | 113.9k | 46.0k |

Compiled and rendered each time (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 667.5k | 18.6k | 203.8k | 56.1k | 176.4k | 87.2k |
| list of 20 (each, if) | 97.7k | 5.7k | 49.6k | 12.8k | 57.3k | 24.9k |
