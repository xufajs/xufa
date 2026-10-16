// body-parser: the parsers of @xufa/express (express.json(), urlencoded(), raw(), text()).
import express from '@xufa/express';

const bodyParser = { json: express.json, urlencoded: express.urlencoded, raw: express.raw, text: express.text };

export default bodyParser;
