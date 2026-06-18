import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readGodaddyCsv } from '../../src/csv/reader.js';
import { GODADDY_HEADERS, writeGodaddyCsv } from '../../src/csv/writer.js';

const fixturePath = 'testdata/godaddy-products-export.csv';

test('writeGodaddyCsv round-trips the sample export', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'godaddy-writer-'));
  const outputPath = path.join(tempDir, 'round-trip.csv');

  try {
    const original = await readGodaddyCsv(fixturePath);
    await writeGodaddyCsv(original, outputPath);
    const reparsed = await readGodaddyCsv(outputPath);

    assert.deepEqual(reparsed, original);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('writeGodaddyCsv preserves the expected Godaddy header order', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'godaddy-writer-'));
  const outputPath = path.join(tempDir, 'headers.csv');

  try {
    const products = await readGodaddyCsv(fixturePath);
    await writeGodaddyCsv(products, outputPath);

    const [headerLine] = (await readFile(outputPath, 'utf8')).split(/\r?\n/);
    assert.equal(headerLine, GODADDY_HEADERS.join(','));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
