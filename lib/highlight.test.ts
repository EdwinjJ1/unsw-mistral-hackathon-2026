import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHighlightHref,
  parseHighlightedNodeIds,
} from './highlight.ts';

test('buildHighlightHref normalises, deduplicates, and encodes node IDs', () => {
  assert.equal(
    buildHighlightHref([
      'team.product',
      'task.alpha',
      'team.product',
      '  ',
    ]),
    '/?highlight=task.alpha%2Cteam.product',
  );
});

test('buildHighlightHref returns the graph root when no nodes are supplied', () => {
  assert.equal(buildHighlightHref([]), '/');
});

test('parseHighlightedNodeIds handles empty, duplicate, and unordered values', () => {
  assert.deepEqual(parseHighlightedNodeIds(null), []);
  assert.deepEqual(
    parseHighlightedNodeIds('team.product,task.alpha,team.product'),
    ['task.alpha', 'team.product'],
  );
});

test('the highlight contract round-trips through URLSearchParams', () => {
  const href = buildHighlightHref(['task.rollback-runbook', 'team.legal-ops']);
  const value = new URL(href, 'https://athena.local').searchParams.get(
    'highlight',
  );

  assert.deepEqual(parseHighlightedNodeIds(value), [
    'task.rollback-runbook',
    'team.legal-ops',
  ]);
});
