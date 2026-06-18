import { writeFile } from 'node:fs/promises';
import { stringify } from 'csv-stringify/sync';

import type { Product } from '../model/types.js';

export const GODADDY_HEADERS = [
  'SKU',
  'EAN',
  'UPC',
  'TYPE',
  'NAME',
  'SHORTCODE',
  'VARIANT GROUP ID',
  'STATUS',
  'PRICE',
  'SALE PRICE',
  'AVAILABLE',
  'COMMITTED',
  'BACKORDERED',
  'ON HAND',
  'TRACKING',
  'BACKORDER LIMIT',
  'DESCRIPTION',
  'WEIGHT',
  'UNIT OF WEIGHT',
  'GTIN CODE',
  'PRODUCT ID',
  'OPTION 1 NAME',
  'OPTION 1 VALUE',
  'OPTION 2 NAME',
  'OPTION 2 VALUE',
] as const;

export async function writeGodaddyCsv(products: Product[], path: string): Promise<void> {
  await writeFile(path, serializeGodaddyCsv(products), 'utf8');
}

export function serializeGodaddyCsv(products: Product[]): string {
  const rows: string[][] = [Array.from(GODADDY_HEADERS)];

  for (const product of products) {
    rows.push([
      '',
      '',
      '',
      product.type,
      product.name,
      product.shortcode,
      '',
      product.status,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      product.aiDescription ?? product.description,
      '',
      '',
      '',
      product.id,
      '',
      '',
      '',
      '',
    ]);

    for (const variant of product.variants) {
      rows.push([
        variant.sku,
        '',
        '',
        '',
        variant.name,
        variant.shortcode || product.shortcode,
        product.id,
        variant.status || product.status,
        formatNumber(variant.price ?? product.price),
        formatNumber(variant.salePrice ?? product.salePrice),
        variant.available ? 'YES' : 'NO',
        '',
        '',
        '',
        '',
        '',
        variant.description,
        formatNumber(variant.weight ?? product.weight),
        variant.weightUnit || product.weightUnit,
        '',
        variant.id,
        variant.option1Name,
        variant.option1Value,
        variant.option2Name,
        variant.option2Value,
      ]);
    }
  }

  return stringify(rows, { quoted_match: /[\n,"]/ });
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
