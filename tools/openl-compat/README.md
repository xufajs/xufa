# openl-compat

Runs the example workbooks of [OpenL Tablets](https://github.com/openl-tablets/openl-tablets) (its demo projects:
examples, tutorials and templates) with [`@xufa/rules`](../../packages/rules): each workbook is loaded and the rows of
its own Test tables are run against the results they expect (those OpenL gives).

The workbooks are OpenL's (LGPL 3.0) and are not in this repository: `fetch.js` gets them, at commit
[`52d11b6c`](https://github.com/openl-tablets/openl-tablets/tree/52d11b6c88c3387eb142968455d307ca63edd74e)
(`files.json` lists them; `resources.json` the other files of their projects they need: the message bundles of
`i18n` folders, which `run.js` gives to the books of the project as their `messages`).

```sh
cd tools/openl-compat
node fetch.js                 # the workbooks into workbooks/, from GitHub
node fetch.js <openl clone>   # or from a local clone
node run.js                   # every workbook: how it loads, the rows that pass, the causes of failures
node run.js Tutorial8 -v      # the workbooks whose path has Tutorial8, with each failing row
```

`results/summary.json` keeps each workbook's tables by kind, the tables not supported, the rows that pass and the
messages of the failures. A workbook of tests (`tests/`) runs with the workbooks of rules of its project, as OpenL
compiles them together.

At that commit 722 of the 743 rows pass. The others need what is not supported: the deprecated tables (ColumnMatch,
TBasic, Table Part, and a test of a rule that calls one), classes of Java (Environment tables) and years past those of
JavaScript's dates.
