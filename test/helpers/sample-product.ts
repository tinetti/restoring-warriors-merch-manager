import type { Product } from '../../src/model/types.js';

export function makeSampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    parentId: 'prod-1',
    name: 'In Jesus Name T-Shirt',
    type: 'PHYSICAL',
    shortcode: 'INJES',
    status: 'ACTIVE',
    description: 'Faith-forward tee',
    weight: 1,
    weightUnit: 'lbs',
    available: true,
    price: 25,
    salePrice: null,
    family: 'INJES',
    variants: [
      {
        id: 'prod-1-black-small',
        parentId: 'prod-1',
        name: 'In Jesus Name T-Shirt black / small',
        sku: 'OLD-SKU',
        shortcode: 'INJES',
        status: 'ACTIVE',
        price: 25,
        salePrice: null,
        available: true,
        weight: 1,
        weightUnit: 'lbs',
        option1Name: 'Color',
        option1Value: 'Black',
        option2Name: 'Size',
        option2Value: 'Small',
        description: '',
      },
    ],
    images: [],
    aiDescription: null,
    ...overrides,
  };
}
