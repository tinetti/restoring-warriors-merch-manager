export type ProductFamily = 'INJES' | 'RESTO' | 'SNAPB' | 'OTHER';

export interface ImageRef {
  fileName: string;
  altText: string;
  isPrimary: boolean;
}

export interface Variant {
  id: string;
  parentId: string;
  name: string;
  sku: string;
  shortcode: string;
  status: string;
  price: number | null;
  salePrice: number | null;
  available: boolean;
  weight: number | null;
  weightUnit: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  description: string;
}

export interface Product {
  id: string;
  parentId: string;
  name: string;
  type: string;
  shortcode: string;
  status: string;
  description: string;
  weight: number | null;
  weightUnit: string;
  available: boolean;
  price: number | null;
  salePrice: number | null;
  family: ProductFamily;
  variants: Variant[];
  images: ImageRef[];
  aiDescription: string | null;
}
