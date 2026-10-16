// @xufa/config/dotenv/config: .env read before the app, as dotenv/config: node -r @xufa/config/dotenv/config app.js
// (or import '@xufa/config/dotenv/config' first). Options from DOTENV_CONFIG_* variables and, over them,
// dotenv_config_*= arguments; quiet unless dotenv_config_quiet=false.
import { dotenv, envOptions, cliOptions } from './lib/dotenv-api.js';

dotenv.config({ ...envOptions(), ...cliOptions(process.argv) });
