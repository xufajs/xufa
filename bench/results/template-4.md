
Compiled once, then rendered (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 14.22M | 1.38M | 1.64M | 2.24M | 11.19M | 823.6k |
| list of 20 (each, if) | 241.3k | 69.3k | 76.0k | 40.9k | 114.2k | 47.0k |

Compiled and rendered each time (renders a second):

| Case | xufa | handlebars | mustache | nunjucks | eta | ejs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| one line | 655.0k | 18.7k | 204.3k | 56.7k | 172.2k | 86.8k |
| list of 20 (each, if) | 97.9k | 5.4k | 48.7k | 12.3k | 56.1k | 23.8k |
