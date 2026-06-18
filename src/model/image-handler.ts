import path from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';

import type { Product } from './types.js';

export interface OrganizedImage {
  productId: string;
  sourcePath: string;
  destinationPath: string;
  destinationRelativePath: string;
}

export class ImageHandler {
  constructor(
    public readonly sourceDir: string,
    public readonly outputDir: string,
  ) {}

  async organizeImages(products: Product[]): Promise<OrganizedImage[]> {
    await mkdir(this.outputDir, { recursive: true });
    const copied: OrganizedImage[] = [];

    for (const product of products) {
      for (const [index, image] of product.images.entries()) {
        const extension = path.extname(image.fileName) || '.jpg';
        const destinationRelativePath = `${product.id}-${index + 1}${extension.toLowerCase()}`;
        const sourcePath = path.join(this.sourceDir, image.fileName);
        const destinationPath = path.join(this.outputDir, destinationRelativePath);
        await copyFile(sourcePath, destinationPath);
        copied.push({
          productId: product.id,
          sourcePath,
          destinationPath,
          destinationRelativePath,
        });
      }
    }

    return copied;
  }
}
