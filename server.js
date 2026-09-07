/**
 * Repo-root entry point.
 *
 * The API lives in `server/`, but hosts that were set up without a root
 * directory run a bare `node server.js` from here. This hands straight over
 * to the real server so the deploy works either way.
 */
module.exports = require('./server/src/server');
