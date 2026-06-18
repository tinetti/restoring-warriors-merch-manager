import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ImageHandler } from '../../src/model/image-handler.js';
import { makeSampleProduct } from '../helpers/sample-product.js';

test('ImageHandler organizes product images into the export directory', async () => {
  const sourceDir = await mkdtemp(path.join(os.tmpdir(), 'godaddy-images-src-'));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'godaddy-images-out-'));

  try {
    const sourceFile = path.join(sourceDir, 'shirt.jpg');
    await writeFile(sourceFile, 'image-bytes');

    const product = makeSampleProduct({
      images: [{ fileName: 'shirt.jpg', altText: 'Front view', isPrimary: true }],
    });

    const handler = new ImageHandler(sourceDir, outputDir);
    const copied = await handler.organizeImages([product]);

    assert.equal(copied.length, 1);
    assert.equal(copied[0]?.destinationRelativePath, 'prod-1-1.jpg');
    assert.equal(await readFile(path.join(outputDir, 'prod-1-1.jpg'), 'utf8'), 'image-bytes');
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});
