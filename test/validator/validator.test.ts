import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProducts } from '../../src/validator/validator.js';
import { makeSampleProduct } from '../helpers/sample-product.js';

test('validateProducts reports duplicate SKUs and negative prices', () => {
  const product = makeSampleProduct({
    name: '',
    description: '',
    variants: [
      {
        ...makeSampleProduct().variants[0]!,
        sku: 'DUPLICATE',
        price: -1,
      },
      {
        ...makeSampleProduct().variants[0]!,
        id: 'prod-1-black-medium',
        option2Value: 'Medium',
        sku: 'DUPLICATE',
      },
    ],
  });

  const issues = validateProducts([product]);

  assert.equal(issues.some((issue) => issue.message.includes('name')), true);
  assert.equal(issues.some((issue) => issue.message.includes('description')), true);
  assert.equal(issues.some((issue) => issue.message.includes('Duplicate SKU')), true);
  assert.equal(issues.some((issue) => issue.message.includes('negative')), true);
});
