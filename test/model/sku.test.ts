import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultSkuConfig, regenerateAllSkus } from '../../src/model/sku.js';
import { makeSampleProduct } from '../helpers/sample-product.js';

test('regenerateAllSkus creates readable SKUs from family and variant attributes', () => {
  const product = makeSampleProduct();

  regenerateAllSkus(product, defaultSkuConfig());

  assert.equal(product.variants[0]?.sku, 'INJES-IN-JESUS-NAME-TSHIRT-BLK-S');
});

test('regenerateAllSkus sanitizes names and resolves collisions with suffixes', () => {
  const product = makeSampleProduct({
    name: 'Restoring Warriors!!! Hoodie',
    family: 'RESTO',
    variants: [
      {
        id: '1',
        parentId: 'prod-1',
        name: 'variant-1',
        sku: '',
        shortcode: 'RESTO',
        status: 'ACTIVE',
        price: 42,
        salePrice: null,
        available: true,
        weight: 1,
        weightUnit: 'lbs',
        option1Name: 'Color',
        option1Value: 'Black',
        option2Name: 'Size',
        option2Value: 'Large',
        description: '',
      },
      {
        id: '2',
        parentId: 'prod-1',
        name: 'variant-2',
        sku: '',
        shortcode: 'RESTO',
        status: 'ACTIVE',
        price: 42,
        salePrice: null,
        available: true,
        weight: 1,
        weightUnit: 'lbs',
        option1Name: 'Color',
        option1Value: 'Black',
        option2Name: 'Size',
        option2Value: 'Large',
        description: '',
      },
    ],
  });

  regenerateAllSkus(product, defaultSkuConfig());

  assert.equal(product.variants[0]?.sku, 'RESTO-RESTORING-WARRIORS-HOODIE-BLK-L');
  assert.equal(product.variants[1]?.sku, 'RESTO-RESTORING-WARRIORS-HOODIE-BLK-L-2');
});
