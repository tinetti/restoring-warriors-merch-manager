import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../../src/server/app.js';
import { makeSampleProduct } from '../helpers/sample-product.js';

async function startTestServer() {
  const imagesDir = await mkdtemp(path.join(os.tmpdir(), 'godaddy-server-images-'));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'godaddy-server-output-'));
  const app = createApp({
    initialProducts: [makeSampleProduct()],
    imageSourceDir: imagesDir,
    imageOutputDir: outputDir,
    aiProvider: {
      async chat() {
        return 'Rewritten copy';
      },
    },
  });
  await app.start(0);
  return { app, imagesDir, outputDir };
}

test('server exposes product CRUD, export, validation, AI rewrite, and image upload', async () => {
  const { app, imagesDir, outputDir } = await startTestServer();

  try {
    const productsResponse = await fetch(`${app.baseUrl}/api/products`);
    assert.equal(productsResponse.status, 200);
    const products = await productsResponse.json();
    assert.equal(products.length, 1);

    const productResponse = await fetch(`${app.baseUrl}/api/products/prod-1`);
    assert.equal(productResponse.status, 200);

    const updateResponse = await fetch(`${app.baseUrl}/api/products/prod-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...products[0], name: 'Updated Name' }),
    });
    assert.equal(updateResponse.status, 200);

    const rewriteResponse = await fetch(`${app.baseUrl}/api/products/prod-1/rewrite-description`, { method: 'POST' });
    assert.equal(rewriteResponse.status, 200);
    assert.deepEqual(await rewriteResponse.json(), { rewritten: 'Rewritten copy' });

    const validationResponse = await fetch(`${app.baseUrl}/api/products/validate`, { method: 'POST' });
    assert.equal(validationResponse.status, 200);
    assert.deepEqual(await validationResponse.json(), { issues: [] });

    const uploadPath = path.join(imagesDir, 'upload.jpg');
    await writeFile(uploadPath, 'test-image');
    const uploadForm = new FormData();
    uploadForm.append('files', new Blob([await readFile(uploadPath)]), 'upload.jpg');
    const uploadResponse = await fetch(`${app.baseUrl}/api/products/prod-1/images`, {
      method: 'POST',
      body: uploadForm,
    });
    assert.equal(uploadResponse.status, 200);
    const uploadPayload = await uploadResponse.json();
    assert.deepEqual(uploadPayload.uploaded, ['upload.jpg']);

    const regenerateResponse = await fetch(`${app.baseUrl}/api/products/prod-1/regenerate-sku`, { method: 'POST' });
    assert.equal(regenerateResponse.status, 200);
    const regeneratePayload = await regenerateResponse.json();
    assert.equal(regeneratePayload.skusRegenerated, 1);

    const imageOutputFiles = await readFile(path.join(outputDir, 'prod-1-1.jpg'), 'utf8');
    assert.equal(imageOutputFiles, 'test-image');

    const importCsv = await readFile('testdata/godaddy-products-export.csv');
    const importForm = new FormData();
    importForm.set('file', new Blob([importCsv]), 'products.csv');
    const importResponse = await fetch(`${app.baseUrl}/api/products/import`, {
      method: 'POST',
      body: importForm,
    });
    assert.equal(importResponse.status, 200);
    const importPayload = await importResponse.json();
    assert.equal(importPayload.imported, 8);

    const exportResponse = await fetch(`${app.baseUrl}/api/products/export`, { method: 'POST' });
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-type') ?? '', /text\/csv/);
    const exported = await exportResponse.text();
    assert.match(exported, /SKU,EAN,UPC,TYPE/);
  } finally {
    await app.stop();
    await rm(imagesDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});
