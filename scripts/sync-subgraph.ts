/**
 * Copies the pox-5 membership rules into the subgraph file.
 *
 * `secondlayer subgraphs test` and `deploy` bundle the subgraph file from
 * stdin, so a relative import has nothing to resolve against:
 *
 *   ERROR: Could not resolve "../scripts/pox5-membership"
 *
 * The subgraph therefore has to carry the rules itself. They stay written
 * once, in scripts/pox5-membership.ts, where the unit tests and the replay
 * against the chain use them, and this script copies them between two marker
 * lines in subgraphs/pox5-signer-members.ts. `scripts/sync-subgraph.test.ts`
 * fails while the copy differs, so the deployed rules are always the tested
 * ones.
 *
 * Usage:
 *   pnpm subgraph:sync
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RULES = path.join(ROOT, 'scripts/pox5-membership.ts');
export const SUBGRAPH = path.join(ROOT, 'subgraphs/pox5-signer-members.ts');

export const BEGIN =
  '// ---- BEGIN copied from scripts/pox5-membership.ts by `pnpm subgraph:sync`. Do not edit here. ----';
export const END = '// ---- END copied from scripts/pox5-membership.ts ----';

/**
 * The rules as the subgraph carries them: without the module's header
 * comment, which describes the module rather than the subgraph, and without
 * `export`, since the subgraph file's only export is its definition.
 */
export function rulesBlock(rules: string): string {
  const body = rules.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
  return body.replace(/^export /gm, '').trimEnd();
}

/** The subgraph file with its copy of the rules brought up to date. */
export function syncedSubgraph(subgraph: string, rules: string): string {
  const start = subgraph.indexOf(BEGIN);
  const end = subgraph.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${SUBGRAPH} has lost its BEGIN/END marker lines`);
  }
  return (
    subgraph.slice(0, start + BEGIN.length) +
    `\n\n${rulesBlock(rules)}\n\n` +
    subgraph.slice(end)
  );
}

function main() {
  const before = fs.readFileSync(SUBGRAPH, 'utf8');
  const after = syncedSubgraph(before, fs.readFileSync(RULES, 'utf8'));
  if (after === before) {
    console.log('The subgraph already carries the current rules.');
    return;
  }
  fs.writeFileSync(SUBGRAPH, after);
  console.log(`Copied the rules into ${path.relative(ROOT, SUBGRAPH)}.`);
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) main();
