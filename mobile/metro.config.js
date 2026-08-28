// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(repoRoot, 'src');
const projectModules = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

/*
 * The app imports the guide's pure modules straight out of `../src` rather
 * than keeping a second copy of them — the staking rules, the contract
 * profiles, the sats-per-1000-STX conversion. Metro will not read a file
 * outside the project root unless it is told to watch it, so `../src` is
 * added here and nothing else: the repo root also holds `.git` and the web
 * app's `node_modules`, neither of which this bundle has any business in.
 */
config.watchFolders = [sharedRoot];

/*
 * A bare import made *from a shared file* resolves in this app's
 * `node_modules` and nowhere else.
 *
 * Without this, `../src/lib/staking.ts` asking for `@stacks/transactions`
 * finds the web app's copy by walking up from its own directory, and the
 * bundle carries two of them. Doing it here rather than with
 * `disableHierarchicalLookup` is deliberate: that switch turns off nested
 * lookup for *every* file, and npm nests — `@walletconnect/utils` keeps its
 * own `@noble/hashes` because the hoisted one is a major version ahead of what
 * it asks for. Turning the walk off entirely made that unresolvable.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const relative = moduleName.startsWith('.') || path.isAbsolute(moduleName);
  const fromShared = context.originModulePath?.startsWith(sharedRoot + path.sep);

  if (fromShared && !relative) {
    return context.resolveRequest(
      { ...context, nodeModulesPaths: [projectModules], disableHierarchicalLookup: true },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
