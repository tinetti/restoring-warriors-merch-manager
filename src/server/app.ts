import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { parseGodaddyCsv } from '../csv/reader.js';
import { serializeGodaddyCsv } from '../csv/writer.js';
import { defaultSkuConfig, regenerateAllSkus } from '../model/sku.js';
import { ImageHandler } from '../model/image-handler.js';
import type { Product } from '../model/types.js';
import { ProductStore } from '../store.js';
import type { AiProvider } from '../ai/provider.js';
import { rewriteDescription } from '../ai/rewrite.js';
import { validateProducts } from '../validator/validator.js';

interface CreateAppOptions {
  initialProducts?: Product[];
  imageSourceDir?: string;
  imageOutputDir?: string;
  aiProvider?: AiProvider | null;
}

export function createApp(options: CreateAppOptions = {}) {
  const store = new ProductStore(options.initialProducts ?? []);
  const imageSourceDir = options.imageSourceDir ?? path.join(process.cwd(), 'images');
  const imageOutputDir = options.imageOutputDir ?? path.join(process.cwd(), 'godaddy-import');
  const imageHandler = new ImageHandler(imageSourceDir, imageOutputDir);
  const aiProvider = options.aiProvider ?? null;
  let server: HttpServer | null = null;
  let baseUrl = '';

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
      const method = req.method ?? 'GET';

      if (method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'GET' && url.pathname === '/api/products') {
        return sendJson(res, 200, store.list());
      }

      if (method === 'POST' && url.pathname === '/api/products/validate') {
        return sendJson(res, 200, { issues: validateProducts(store.list()) });
      }

      if (method === 'POST' && url.pathname === '/api/products/import') {
        const form = await readFormData(req, url);
        const file = form.get('file');
        if (!(file instanceof File)) {
          return sendJson(res, 400, { error: 'Missing file upload.' });
        }
        const text = await file.text();
        const products = parseGodaddyCsv(text);
        store.setAll(products);
        return sendJson(res, 200, { imported: products.length });
      }

      if (method === 'POST' && url.pathname === '/api/products/export') {
        const products = store.list();
        await imageHandler.organizeImages(products);
        const csv = serializeGodaddyCsv(products);
        res.statusCode = 200;
        res.setHeader('content-type', 'text/csv; charset=utf-8');
        res.setHeader('content-disposition', 'attachment; filename="godaddy-export.csv"');
        res.end(csv);
        return;
      }

      const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
      if (method === 'GET' && productMatch) {
        const product = store.get(decodeURIComponent(productMatch[1] ?? ''));
        if (!product) {
          return sendJson(res, 404, { error: 'Product not found' });
        }
        return sendJson(res, 200, product);
      }

      if (method === 'PUT' && productMatch) {
        const body = await readJsonBody(req);
        const product = body as Product;
        if (product.id !== decodeURIComponent(productMatch[1] ?? '')) {
          return sendJson(res, 400, { error: 'Product id mismatch' });
        }
        store.update(product);
        return sendJson(res, 200, { success: true });
      }

      const rewriteMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/rewrite-description$/);
      if (method === 'POST' && rewriteMatch) {
        const product = store.get(decodeURIComponent(rewriteMatch[1] ?? ''));
        if (!product) {
          return sendJson(res, 404, { error: 'Product not found' });
        }
        if (!aiProvider) {
          return sendJson(res, 400, { error: 'AI not configured. Set GODADDY_AI_API_KEY or --ai-api-key.' });
        }
        const rewritten = await rewriteDescription(product, aiProvider);
        product.aiDescription = rewritten;
        store.update(product);
        return sendJson(res, 200, { rewritten });
      }

      const regenerateMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/regenerate-sku$/);
      if (method === 'POST' && regenerateMatch) {
        const product = store.get(decodeURIComponent(regenerateMatch[1] ?? ''));
        if (!product) {
          return sendJson(res, 404, { error: 'Product not found' });
        }
        regenerateAllSkus(product, defaultSkuConfig());
        store.update(product);
        return sendJson(res, 200, { skusRegenerated: product.variants.length });
      }

      const uploadMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/images$/);
      if (method === 'POST' && uploadMatch) {
        const product = store.get(decodeURIComponent(uploadMatch[1] ?? ''));
        if (!product) {
          return sendJson(res, 404, { error: 'Product not found' });
        }

        const form = await readFormData(req, url);
        const files = form.getAll('files');
        const uploaded: string[] = [];
        await mkdir(imageSourceDir, { recursive: true });

        for (const entry of files) {
          if (!(entry instanceof File)) {
            continue;
          }
          const fileName = entry.name;
          const targetPath = path.join(imageSourceDir, fileName);
          const buffer = Buffer.from(await entry.arrayBuffer());
          await writeFile(targetPath, buffer);
          product.images.push({
            fileName,
            altText: product.name,
            isPrimary: product.images.length === 0,
          });
          uploaded.push(fileName);
        }

        store.update(product);
        await imageHandler.organizeImages([product]);
        return sendJson(res, 200, { uploaded });
      }

      return serveStatic(url.pathname, res);
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Internal server error' });
    }
  }

  return {
    get baseUrl() {
      return baseUrl;
    },
    store,
    async start(port: number): Promise<void> {
      server = createServer((req, res) => {
        void handle(req, res);
      });
      await new Promise<void>((resolve) => server!.listen(port, resolve));
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to determine server address.');
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
    },
    async stop(): Promise<void> {
      if (!server) {
        return;
      }
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }),
      );
    },
  };
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const filePath = path.join(process.cwd(), 'web', relativePath);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error('Not a file');
    }
    const content = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentType(filePath));
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : Buffer.from(chunk));
  }
  const payload = Buffer.concat(chunks).toString('utf8');
  return payload ? (JSON.parse(payload) as unknown) : {};
}

async function readFormData(req: IncomingMessage, url: URL): Promise<FormData> {
  const request = new Request(
    url,
    {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' },
  );

  return request.formData();
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  return 'text/html; charset=utf-8';
}
