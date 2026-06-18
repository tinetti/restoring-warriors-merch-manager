import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readGodaddyCsv } from './csv/reader.js';
import { writeGodaddyCsv } from './csv/writer.js';
import { createApp } from './server/app.js';
import { ImageHandler } from './model/image-handler.js';
import { OpenAiProvider } from './ai/provider.js';
import type { Product } from './model/types.js';

async function main(): Promise<void> {
  const [, , command = 'server', ...args] = process.argv;

  if (command === 'parse') {
    const input = getFlag(args, '--input') ?? 'godaddy-products-export.csv';
    const output = getFlag(args, '--output');
    const products = await readGodaddyCsv(input);
    const json = `${JSON.stringify(products, null, 2)}\n`;
    if (output) {
      await writeFile(output, json, 'utf8');
    } else {
      process.stdout.write(json);
    }
    return;
  }

  if (command === 'export') {
    const input = getFlag(args, '--input');
    const output = getFlag(args, '--output') ?? 'godaddy-export.csv';
    if (!input) {
      throw new Error('export requires --input <products.json>');
    }
    const content = await readFile(input, 'utf8');
    const products = JSON.parse(content) as Product[];
    await writeGodaddyCsv(products, output);
    const imagesDir = getFlag(args, '--images-dir') ?? path.join(process.cwd(), 'images');
    const outputDir = getFlag(args, '--output-dir') ?? path.join(process.cwd(), 'godaddy-import');
    await mkdir(outputDir, { recursive: true });
    await new ImageHandler(imagesDir, outputDir).organizeImages(products);
    return;
  }

  if (command === 'server') {
    const port = Number(getFlag(args, '--port') ?? '8080');
    const input = getFlag(args, '--input') ?? 'godaddy-products-export.csv';
    const imagesDir = getFlag(args, '--images-dir') ?? path.join(process.cwd(), 'images');
    const outputDir = getFlag(args, '--output-dir') ?? path.join(process.cwd(), 'godaddy-import');
    const apiKey = getFlag(args, '--ai-api-key') ?? process.env.GODADDY_AI_API_KEY ?? '';
    const model = process.env.GODADDY_AI_MODEL ?? 'gpt-4o-mini';
    const initialProducts = await safeReadProducts(input);
    const aiProvider = apiKey
      ? new OpenAiProvider({ apiKey, baseUrl: process.env.GODADDY_AI_BASE_URL, model })
      : null;

    const app = createApp({
      initialProducts,
      imageSourceDir: imagesDir,
      imageOutputDir: outputDir,
      aiProvider,
    });

    await app.start(port);
    process.stdout.write(`Godaddy Ecommerce Manager running at ${app.baseUrl}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

async function safeReadProducts(input: string): Promise<Product[]> {
  try {
    return await readGodaddyCsv(input);
  } catch {
    return [];
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
