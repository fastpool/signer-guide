import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RULES,
  SUBGRAPH,
  rulesBlock,
  syncedSubgraph,
} from './sync-subgraph.js';

/*
 * The subgraph carries a copy of the membership rules, because the CLI
 * cannot follow an import out of the file. The copy is only trustworthy while
 * it is the tested module, character for character.
 */
describe('the subgraph’s copy of the pox-5 membership rules', () => {
  it('is the current scripts/pox5-membership.ts (run `pnpm subgraph:sync`)', () => {
    const subgraph = fs.readFileSync(SUBGRAPH, 'utf8');
    const rules = fs.readFileSync(RULES, 'utf8');
    expect(syncedSubgraph(subgraph, rules)).toBe(subgraph);
  });

  it('imports nothing but the subgraph package', () => {
    const subgraph = fs.readFileSync(SUBGRAPH, 'utf8');
    const imports = [...subgraph.matchAll(/^import .* from '([^']+)';$/gm)].map(
      (m) => m[1],
    );
    expect(imports).toEqual(['@secondlayer/subgraphs']);
  });

  it('drops the module header and its exports', () => {
    const block = rulesBlock('/**\n * header\n */\n\nexport const A = 1;\n');
    expect(block).toBe('const A = 1;');
  });
});
