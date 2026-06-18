import type { Product } from '../model/types.js';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}

export function validateProducts(products: Product[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const skuOwners = new Map<string, string>();

  for (const product of products) {
    if (!product.name.trim()) {
      issues.push({ severity: 'warning', field: `product:${product.id}:name`, message: 'Product name is missing.' });
    }

    if (!product.description.trim()) {
      issues.push({ severity: 'warning', field: `product:${product.id}:description`, message: 'Product description is missing.' });
    }

    if (product.price !== null && product.price < 0) {
      issues.push({ severity: 'error', field: `product:${product.id}:price`, message: 'Product price cannot be negative.' });
    }

    for (const variant of product.variants) {
      if (!variant.sku.trim()) {
        issues.push({ severity: 'warning', field: `variant:${variant.id}:sku`, message: 'Variant SKU is missing.' });
      }

      if (variant.price !== null && variant.price < 0) {
        issues.push({ severity: 'error', field: `variant:${variant.id}:price`, message: 'Variant price cannot be negative.' });
      }

      if (variant.price === 0) {
        issues.push({ severity: 'warning', field: `variant:${variant.id}:price`, message: 'Variant price is zero.' });
      }

      if (variant.sku.trim()) {
        const owner = skuOwners.get(variant.sku);
        if (owner) {
          issues.push({ severity: 'error', field: `variant:${variant.id}:sku`, message: `Duplicate SKU detected: ${variant.sku}.` });
        } else {
          skuOwners.set(variant.sku, variant.id);
        }
      }
    }
  }

  return issues;
}
