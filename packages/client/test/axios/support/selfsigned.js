// selfsigned's generate(): the key and certificate of test/fixtures (a self-signed one for localhost).
import fs from 'node:fs';

const fixture = (name) => fs.readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const generate = async () => ({ private: fixture('key.pem'), cert: fixture('cert.pem') });

export default { generate };
