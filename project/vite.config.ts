import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const DIFY_CHAT_URL = 'https://api.dify.ai/v1/chat-messages';
const PLACEHOLDER_KEY = 'YOUR_DIFY_API_KEY_HERE';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseChatPayload(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.inputs)) return null;

  const query = parsed.query;
  const rawInput = parsed.inputs.raw_input;
  const targetAgent = parsed.inputs.target_agent;
  const user = parsed.user;
  if (
    typeof query !== 'string' ||
    !query.trim() ||
    typeof rawInput !== 'string' ||
    typeof targetAgent !== 'string' ||
    typeof user !== 'string' ||
    parsed.response_mode !== 'blocking'
  ) {
    return null;
  }

  const payload: Record<string, unknown> = {
    inputs: {
      target_agent: targetAgent,
      raw_input: rawInput,
    },
    query,
    response_mode: 'blocking',
    user,
  };

  if (typeof parsed.conversation_id === 'string' && parsed.conversation_id) {
    payload.conversation_id = parsed.conversation_id;
  }

  return payload;
}

function difyProxyPlugin(apiKey: string): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Method Not Allowed' });
      return;
    }

    if (!apiKey || apiKey === PLACEHOLDER_KEY) {
      sendJson(res, 500, {
        message:
          'DIFY_API_KEY が未設定です。.env の DIFY_API_KEY を Dify の API キーに置き換えて、開発サーバーを再起動してください。',
      });
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = parseChatPayload(raw);
      if (!payload) {
        sendJson(res, 400, { message: 'リクエストの形式が不正です。' });
        return;
      }

      const upstream = await fetch(DIFY_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      );
      res.end(text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Dify API への接続に失敗しました。';
      sendJson(res, 502, { message });
    }
  };

  return {
    name: 'dify-chat-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        void handle(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        void handle(req, res);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), difyProxyPlugin(env.DIFY_API_KEY ?? '')],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
