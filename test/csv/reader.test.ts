import test from 'node:test';
import assert from 'node:assert/strict';

import { readGodaddyCsv } from '../../src/csv/reader.js';

const fixturePath = 'testdata/godaddy-products-export.csv';

test('readGodaddyCsv parses products, families, and variants from the real export', async () => {
  const products = await readGodaddyCsv(fixturePath);

  assert.equal(products.length, 8);

  const bigLetter = products.find((product) => product.name === 'In Jesus Name T - Big Letter - Mens T-Shirt');
  assert.ok(bigLetter);
  assert.equal(bigLetter.family, 'INJES');
  assert.equal(bigLetter.variants.length, 20);
  assert.equal(bigLetter.variants[0]?.option1Name, 'Color');
  assert.equal(bigLetter.variants[0]?.option2Value, 'Small');

  const snapback = products.find((product) => product.name.includes('Snapback'));
  assert.ok(snapback);
  assert.equal(snapback.family, 'SNAPB');
  assert.equal(snapback.variants.length, 4);
});

test('readGodaddyCsv preserves multiline descriptions and links variants to parents', async () => {
  const products = await readGodaddyCsv(fixturePath);
  const hoodie = products.find((product) => product.name === 'In Jesus Name Hoodie - Big Logo -');

  assert.ok(hoodie);
  assert.match(hoodie.description, /Front pocket/);
  assert.equal(hoodie.variants.every((variant) => variant.parentId === hoodie.id), true);
});
