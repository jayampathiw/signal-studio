import assert from 'node:assert/strict';
import { test } from 'node:test';

import { z } from 'zod';

import { createAnthropicProvider } from './llm-anthropic.ts';

function fakeResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200 });
}

test('llm-anthropic: sends the system prompt with cache_control and returns text + usage', async (t) => {
  let capturedBody: any;
  t.mock.method(globalThis, 'fetch', async (_url: string, req: RequestInit) => {
    capturedBody = JSON.parse(req.body as string);
    return fakeResponse({
      content: [{ type: 'text', text: 'hello back' }],
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  });

  const provider = createAnthropicProvider({ apiKey: 'sk-ant-test' });
  const result = await provider.complete({
    system: 'you are a helper',
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(result.text, 'hello back');
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3 });
  assert.deepEqual(capturedBody.system, [
    { type: 'text', text: 'you are a helper', cache_control: { type: 'ephemeral' } },
  ]);
});

test('llm-anthropic: schema is provided → JSON is extracted, validated, and returned in .json', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    fakeResponse({
      content: [
        { type: 'text', text: 'Sure, here you go:\n```json\n{"name":"fox","legs":4}\n```' },
      ],
      usage: { input_tokens: 5, output_tokens: 5 },
    }),
  );

  const provider = createAnthropicProvider({ apiKey: 'sk-ant-test' });
  const result = await provider.complete({
    messages: [{ role: 'user', content: 'describe a fox' }],
    schema: z.object({ name: z.string(), legs: z.number() }),
  });

  assert.deepEqual(result.json, { name: 'fox', legs: 4 });
});

test('llm-anthropic: schema provided but response JSON fails validation → throws', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    fakeResponse({
      content: [{ type: 'text', text: '{"name":"fox"}' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    }),
  );

  const provider = createAnthropicProvider({ apiKey: 'sk-ant-test' });
  await assert.rejects(
    () =>
      provider.complete({
        messages: [{ role: 'user', content: 'describe a fox' }],
        schema: z.object({ name: z.string(), legs: z.number() }),
      }),
    /did not match schema/,
  );
});

test('llm-anthropic: ANTHROPIC_PROXY_DOUBLE_ENCODED=1 unwraps a JSON-string response body', async (t) => {
  const prev = process.env.ANTHROPIC_PROXY_DOUBLE_ENCODED;
  process.env.ANTHROPIC_PROXY_DOUBLE_ENCODED = '1';
  t.mock.method(globalThis, 'fetch', async () =>
    fakeResponse(
      JSON.stringify({
        content: [{ type: 'text', text: 'unwrapped' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    ),
  );

  try {
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test' });
    const result = await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result.text, 'unwrapped');
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_PROXY_DOUBLE_ENCODED;
    else process.env.ANTHROPIC_PROXY_DOUBLE_ENCODED = prev;
  }
});

test('llm-anthropic: non-OK response throws with status + body', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => fakeResponse({ error: 'nope' }, { status: 429 }));

  const provider = createAnthropicProvider({ apiKey: 'sk-ant-test' });
  await assert.rejects(
    () => provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    /Anthropic 429/,
  );
});
