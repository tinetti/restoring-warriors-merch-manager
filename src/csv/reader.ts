import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

import type { Product, ProductFamily, Variant } from '../model/types.js';

interface RawRow {
  SKU: string;
  EAN: string;
  UPC: string;
  TYPE: string;
  NAME: string;
  SHORTCODE: string;
  'VARIANT GROUP ID': string;
  STATUS: string;
  PRICE: string;
  'SALE PRICE': string;
  AVAILABLE: string;
  COMMITTED: string;
  BACKORDERED: string;
  'ON HAND': string;
  TRACKING: string;
  'BACKORDER LIMIT': string;
  DESCRIPTION: string;
  WEIGHT: string;
  'UNIT OF WEIGHT': string;
  'GTIN CODE': string;
  'PRODUCT ID': string;
  'OPTION 1 NAME': string;
  'OPTION 1 VALUE': string;
  'OPTION 2 NAME': string;
  'OPTION 2 VALUE': string;
}

export async function readGodaddyCsv(path: string): Promise<Product[]> {
  return parseGodaddyCsv(await readFile(path, 'utf8'));
}

export function parseGodaddyCsv(content: string): Product[] {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
  }) as RawRow[];

  const products = new Map<string, Product>();

  for (const row of rows) {
    if (row.SKU.trim()) {
      continue;
    }

    const productId = row['PRODUCT ID'].trim();
    const product: Product = {
      id: productId,
      parentId: productId,
      name: row.NAME,
      type: row.TYPE || 'PHYSICAL',
      shortcode: row.SHORTCODE,
      status: row.STATUS,
      description: row.DESCRIPTION,
      weight: parseOptionalNumber(row.WEIGHT),
      weightUnit: row['UNIT OF WEIGHT'] || 'lbs',
      available: parseOptionalBoolean(row.AVAILABLE) ?? true,
      price: parseOptionalNumber(row.PRICE),
      salePrice: parseOptionalNumber(row['SALE PRICE']),
      family: detectFamily(row.SHORTCODE, row.NAME),
      variants: [],
      images: [],
      aiDescription: null,
    };

    products.set(product.id, product);
  }

  for (const row of rows) {
    if (!row.SKU.trim()) {
      continue;
    }

    const parentId = row['VARIANT GROUP ID'].trim();
    const parent = products.get(parentId);
    if (!parent) {
      continue;
    }

    const variant: Variant = {
      id: row['PRODUCT ID'].trim(),
      parentId,
      name: row.NAME,
      sku: row.SKU,
      shortcode: row.SHORTCODE,
      status: row.STATUS,
      price: parseOptionalNumber(row.PRICE),
      salePrice: parseOptionalNumber(row['SALE PRICE']),
      available: parseOptionalBoolean(row.AVAILABLE) ?? true,
      weight: parseOptionalNumber(row.WEIGHT),
      weightUnit: row['UNIT OF WEIGHT'] || parent.weightUnit || 'lbs',
      option1Name: row['OPTION 1 NAME'],
      option1Value: row['OPTION 1 VALUE'],
      option2Name: row['OPTION 2 NAME'],
      option2Value: row['OPTION 2 VALUE'],
      description: row.DESCRIPTION,
    };

    parent.variants.push(variant);
  }

  for (const product of products.values()) {
    if (product.price === null && product.variants[0]?.price !== undefined) {
      product.price = product.variants[0].price;
    }
    if (product.salePrice === null && product.variants[0]?.salePrice !== undefined) {
      product.salePrice = product.variants[0].salePrice;
    }
    if (product.weight === null && product.variants[0]?.weight !== undefined) {
      product.weight = product.variants[0].weight;
    }
    if (!product.weightUnit && product.variants[0]?.weightUnit) {
      product.weightUnit = product.variants[0].weightUnit;
    }
  }

  return [...products.values()];
}

function detectFamily(shortcode: string, name: string): ProductFamily {
  if (shortcode === 'INJES' || shortcode === 'RESTO' || shortcode === 'SNAPB') {
    return shortcode;
  }
  const normalized = name.toLowerCase();
  if (normalized.includes('snapback')) {
    return 'SNAPB';
  }
  if (normalized.includes('restoring warriors')) {
    return 'RESTO';
  }
  if (normalized.includes('jesus')) {
    return 'INJES';
  }
  return 'OTHER';
}

function parseOptionalNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'yes' || normalized === 'true') {
    return true;
  }
  if (normalized === 'no' || normalized === 'false') {
    return false;
  }
  return null;
}
