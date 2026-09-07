const path = require('path');

/**
 * Loads `server/.env` no matter which directory the process was started from,
 * so `node server.js` at the repo root behaves like `npm start` inside server/.
 * On a host that injects real environment variables there is no file and
 * dotenv simply does nothing.
 */
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
