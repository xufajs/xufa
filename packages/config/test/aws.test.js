// The sources of AWS (Parameter Store, Secrets Manager) against a server that answers as they do and checks the
// signatures; and the signatures, against a vector of the test suite of AWS (post-vanilla).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteConfig, sources } from '../index.js';
import { sign } from '../lib/aws.js';

const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };

const parameters = [
  { Name: '/shop/production/db/url', Type: 'SecureString', Value: 'postgres://shop:p{{a}}ss@db/shop' },
  { Name: '/shop/production/db/pool', Type: 'String', Value: '{"max": 20}' },
  { Name: '/shop/production/port', Type: 'String', Value: '8080' },
  { Name: '/shop/staging/port', Type: 'String', Value: '9090' },
];
const secrets = { 'shop/api': '{"apiKey": "k-1", "webhook": {"secret": "w-2"}}', 'shop/token': 'plain-token' };

const seen = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    const target = req.headers['x-amz-target'];
    const service = target.startsWith('AmazonSSM.') ? 'ssm' : 'secretsmanager';
    // The signature checked: the request signed again with the same date.
    const expected = sign({
      method: req.method,
      url: new URL(req.url, `http://${req.headers.host}`),
      headers: { 'content-type': req.headers['content-type'], 'x-amz-target': target },
      body,
      region: 'eu-west-1',
      service,
      credentials,
      date: new Date(
        req.headers['x-amz-date'].replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z')
      ),
    });
    seen.push({ target, body: JSON.parse(body) });
    const json = (status, value) =>
      res.writeHead(status, { 'content-type': 'application/x-amz-json-1.1' }).end(JSON.stringify(value));
    if (req.headers.authorization !== expected.authorization) {
      return json(403, { __type: 'InvalidSignatureException', message: 'The signature does not match' });
    }
    const input = JSON.parse(body);
    if (target === 'AmazonSSM.GetParametersByPath') {
      const all = parameters.filter((p) => p.Name.startsWith(`${input.Path}/`));
      // Pages of two.
      const from = input.NextToken ? Number(input.NextToken) : 0;
      const page = all.slice(from, from + 2);
      return json(200, { Parameters: page, ...(from + 2 < all.length ? { NextToken: String(from + 2) } : {}) });
    }
    if (target === 'secretsmanager.GetSecretValue') {
      if (!(input.SecretId in secrets)) {
        return json(400, {
          __type: 'ResourceNotFoundException',
          message: "Secrets Manager can't find the specified secret.",
        });
      }
      return json(200, { Name: input.SecretId, SecretString: secrets[input.SecretId] });
    }
    return json(400, { __type: 'UnknownOperationException' });
  });
});

let endpoint;
let cwd;
beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/`;
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-config-aws-'));
});
afterAll(() => {
  server.close();
  fs.rmSync(cwd, { recursive: true, force: true });
});

const environment = {
  AWS_REGION: 'eu-west-1',
  AWS_ACCESS_KEY_ID: credentials.accessKeyId,
  AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
};
const load = (remote, env = environment) => loadRemoteConfig({ cwd, dotenv: false, environment: env, remote });

describe('sources of AWS', () => {
  it('signatures of Signature Version 4: the post-vanilla vector of AWS', () => {
    const headers = sign({
      method: 'POST',
      url: new URL('https://example.amazonaws.com/'),
      headers: {},
      body: '',
      region: 'us-east-1',
      service: 'service',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b'
    );
  });

  it('Parameter Store: the parameters under a path as a tree, every page, decrypted; sensitive, no templates', async () => {
    seen.length = 0;
    const config = await load([sources.ssm({ path: '/shop/production/', endpoint })]);
    expect(config.db).toEqual({ url: 'postgres://shop:p{{a}}ss@db/shop', pool: { max: 20 } });
    expect(config.port).toBe('8080');
    expect(config.redacted().db.url).toBe('[redacted]');
    expect(seen.map((call) => call.body)).toEqual([
      { Path: '/shop/production', Recursive: true, WithDecryption: true },
      { Path: '/shop/production', Recursive: true, WithDecryption: true, NextToken: '2' },
    ]);
  });

  it('Secrets Manager: a secret of JSON as its keys, another as `value`; under `at`', async () => {
    const config = await load([
      sources.secretsManager({ secretId: 'shop/api', endpoint }),
      sources.secretsManager({ secretId: 'shop/token', endpoint, at: 'token' }),
    ]);
    expect(config.apiKey).toBe('k-1');
    expect(config.webhook.secret).toBe('w-2');
    expect(config.token.value).toBe('plain-token');
    expect(config.redacted().apiKey).toBe('[redacted]');
  });

  it('errors: of AWS (its type and message), no region, no credentials, credentials refused', async () => {
    const quick = { endpoint, retries: 0 };
    await expect(load([sources.secretsManager({ secretId: 'nope', ...quick })])).rejects.toThrow(
      /400 ResourceNotFoundException: Secrets Manager can't find/
    );
    await expect(load([sources.ssm({ path: '/shop', ...quick })], { ...environment, AWS_REGION: '' })).rejects.toThrow(
      /no region/
    );
    await expect(
      load([sources.ssm({ path: '/shop', ...quick })], { AWS_REGION: 'eu-west-1', AWS_ACCESS_KEY_ID: 'x' })
    ).rejects.toThrow(/no credentials/);
    await expect(
      load([
        sources.ssm({
          path: '/shop',
          ...quick,
          credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wrong' },
        }),
      ])
    ).rejects.toThrow(/403 InvalidSignatureException/);
    expect(() => sources.ssm({ path: 'shop' })).toThrow(/path is required/);
    expect(() => sources.secretsManager({})).toThrow(/secretId is required/);
  });
});
