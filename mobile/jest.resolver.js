const path = require('node:path');
const upstream = require('@react-native/jest-preset/jest/resolver');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'src');

/**
 * The same rule metro.config.js applies, applied to the test runner.
 *
 * The app imports the guide's pure modules out of `../src` rather than copying
 * them. A bare import made from one of those files resolves from its own
 * directory by default, which is the *web* app's `node_modules` — a second
 * React, a second `@stacks/transactions`. Two Reacts in one render is an
 * "invalid hook call" and nothing more useful, so a shared file's imports are
 * resolved from this project instead, exactly as the bundler resolves them.
 */
module.exports = (request, options) => {
  const bare = !request.startsWith('.') && !path.isAbsolute(request);
  const fromShared = options.basedir?.startsWith(sharedRoot + path.sep);
  if (bare && fromShared) {
    return upstream(request, { ...options, basedir: projectRoot });
  }
  return upstream(request, options);
};
