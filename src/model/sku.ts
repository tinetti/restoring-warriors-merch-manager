import type { Product, Variant } from './types.js';

export interface SkuConfig {
  separator: string;
  maxLength: number;
  abbreviations: Record<string, string>;
}

export function defaultSkuConfig(): SkuConfig {
  return {
    separator: '-',
    maxLength: 64,
    abbreviations: {
      black: 'BLK',
      white: 'WHT',
      blue: 'BLU',
      red: 'RED',
      navy: 'NVY',
      small: 'S',
      medium: 'M',
      large: 'L',
      xl: 'XL',
      '2xl': '2XL',
      '2_xl': '2XL',
      '3xl': '3XL',
    },
  };
}

export function regenerateAllSkus(product: Product, config: SkuConfig): void {
  const seen = new Map<string, number>();

  for (const variant of product.variants) {
    const baseSku = buildSku(product, variant, config);
    const count = (seen.get(baseSku) ?? 0) + 1;
    seen.set(baseSku, count);
    variant.sku = count === 1 ? baseSku : `${baseSku}${config.separator}${count}`;
  }
}

function buildSku(product: Product, variant: Variant, config: SkuConfig): string {
  const tokens = [
    sanitize(product.family, config),
    sanitize(product.name, config),
    abbreviate(variant.option1Value, config),
    abbreviate(variant.option2Value, config),
  ].filter(Boolean);

  const sku = tokens.join(config.separator).replace(/-+/g, config.separator);
  return sku.slice(0, config.maxLength);
}

function abbreviate(value: string, config: SkuConfig): string {
  const normalized = value.trim().toLowerCase();
  const abbreviated = config.abbreviations[normalized] ?? value;
  return sanitize(abbreviated, config);
}

function sanitize(value: string, config: SkuConfig): string {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, '').toUpperCase())
    .filter(Boolean)
    .join(config.separator);
}
