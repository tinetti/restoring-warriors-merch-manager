import type { Product } from '../model/types.js';
import type { AiProvider, ChatMessage } from './provider.js';
import { decodeHtmlEntities, encodeHtmlEntities } from '../utils/html.js';

export function buildRewriteMessages(product: Product): ChatMessage[] {
  const variantSummary = product.variants
    .slice(0, 5)
    .map((variant) => [variant.option1Value, variant.option2Value].filter(Boolean).join(' / '))
    .filter(Boolean)
    .join(', ');

  return [
    {
      role: 'system',
      content:
        'You are a professional ecommerce copywriter. Keep the tone warm, faith-forward, specific, and plain text only. Use 2-4 short paragraphs and avoid hypey openings.',
    },
    {
      role: 'user',
      content: [
        'Rewrite this product description for a Godaddy ecommerce store.',
        `Product Name: ${product.name}`,
        `Product Type: ${product.type}`,
        `Variant Attributes: ${variantSummary || 'None provided'}`,
        `Original Description: ${decodeHtmlEntities(product.description)}`,
      ].join('\n'),
    },
  ];
}

export async function rewriteDescription(product: Product, provider: AiProvider): Promise<string> {
  const rewritten = await provider.chat(buildRewriteMessages(product));
  return encodeHtmlEntities(rewritten);
}
