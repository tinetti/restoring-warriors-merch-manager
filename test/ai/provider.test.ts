import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { OpenAiProvider } from '../../src/ai/provider.js';

test('OpenAiProvider sends chat requests to an OpenAI-compatible endpoint', async () => {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    req.on('data', (chunk) => requests.push(chunk.toString()));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'rewritten copy' } }] }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const provider = new OpenAiProvider({
      apiKey: 'test-key',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'gpt-4o-mini',
    });

    const response = await provider.chat([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
    ]);

    assert.equal(response, 'rewritten copy');
    assert.match(requests.join(''), /gpt-4o-mini/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('OpenAiProvider rejects missing API keys', async () => {
  await assert.rejects(
    async () => {
      const provider = new OpenAiProvider({ apiKey: '', baseUrl: 'http://localhost:1', model: 'gpt-4o-mini' });
      await provider.chat([{ role: 'user', content: 'hello' }]);
    },
    /AI not configured/,
  );
});
