import type { Product } from './model/types.js';

export class ProductStore {
  private products: Product[];

  constructor(initialProducts: Product[] = []) {
    this.products = structuredClone(initialProducts);
  }

  list(): Product[] {
    return structuredClone(this.products);
  }

  get(id: string): Product | undefined {
    return structuredClone(this.products.find((product) => product.id === id));
  }

  setAll(products: Product[]): void {
    this.products = structuredClone(products);
  }

  update(product: Product): Product {
    const index = this.products.findIndex((entry) => entry.id === product.id);
    if (index === -1) {
      throw new Error('Product not found');
    }
    this.products[index] = structuredClone(product);
    return structuredClone(product);
  }
}
