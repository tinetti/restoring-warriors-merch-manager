import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRewriteMessages, rewriteDescription } from '../../src/ai/rewrite.js';
import { makeSampleProduct } from '../helpers/sample-product.js';

test('buildRewriteMessages includes product context and decodes HTML entities', () => {
  const product = makeSampleProduct({ description: 'Faith &amp; purpose' });
  const messages = buildRewriteMessages(product);

  assert.equal(messages[0]?.role, 'system');
  assert.match(messages[1]?.content ?? '', /Faith & purpose/);
  assert.match(messages[1]?.content ?? '', /Product Name: In Jesus Name T-Shirt/);
});

test('rewriteDescription encodes the provider response for CSV storage', async () => {
  const product = makeSampleProduct();
  const rewritten = await rewriteDescription(product, {
    async chat() {
      return 'Faith & purpose';
    },
  });

  assert.equal(rewritten, 'Faith &amp; purpose');
});
