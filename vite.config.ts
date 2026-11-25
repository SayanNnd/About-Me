import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, 'src/content');
const POSTS_DIR = path.resolve(CONTENT_DIR, 'posts');
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function localCmsPlugin(): Plugin {
  return {
    name: 'local-cms-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__cms', async (req, res, next) => {
        const url = (req.url || '').split('?')[0];

        if (req.method === 'GET' && url === '/status') {
          sendJson(res, 200, { available: true, mode: 'local-dev' });
          return;
        }

        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const raw = await readBody(req);
          const data = JSON.parse(raw);

          if (url === '/save-site') {
            if (!data || typeof data !== 'object') {
              sendJson(res, 400, { error: 'Invalid site payload.' });
              return;
            }
            const sitePath = path.join(CONTENT_DIR, 'site.json');
            await fs.writeFile(sitePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
            sendJson(res, 200, { ok: true });
            return;
          }

          if (url === '/save-blog') {
            const { meta, content, previousSlug } = data ?? {};
            if (!meta || typeof meta.slug !== 'string' || !SLUG_RE.test(meta.slug)) {
              sendJson(res, 400, { error: 'Invalid blog slug. Use lowercase letters, numbers, and hyphens.' });
              return;
            }
            if (typeof content !== 'string') {
              sendJson(res, 400, { error: 'Blog content must be a string.' });
              return;
            }

            await fs.mkdir(POSTS_DIR, { recursive: true });
            const postsJsonPath = path.join(CONTENT_DIR, 'posts.json');
            const existingRaw = await fs.readFile(postsJsonPath, 'utf8').catch(() => '[]');
            const posts = JSON.parse(existingRaw) as Array<Record<string, unknown>>;

            const matchSlug = typeof previousSlug === 'string' && SLUG_RE.test(previousSlug) ? previousSlug : meta.slug;
            const idx = posts.findIndex((p) => p.slug === matchSlug || p.slug === meta.slug);
            if (idx >= 0) {
              posts[idx] = meta;
            } else {
              posts.unshift(meta);
            }

            await fs.writeFile(path.join(POSTS_DIR, `${meta.slug}.md`), content, 'utf8');
            if (previousSlug && previousSlug !== meta.slug && SLUG_RE.test(previousSlug)) {
              await fs.unlink(path.join(POSTS_DIR, `${previousSlug}.md`)).catch(() => {});
            }
            await fs.writeFile(postsJsonPath, JSON.stringify(posts, null, 2) + '\n', 'utf8');
            sendJson(res, 200, { ok: true, posts });
            return;
          }

          if (url === '/delete-blog') {
            const { slug } = data ?? {};
            if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
              sendJson(res, 400, { error: 'Invalid slug.' });
              return;
            }
            const postsJsonPath = path.join(CONTENT_DIR, 'posts.json');
            const existingRaw = await fs.readFile(postsJsonPath, 'utf8').catch(() => '[]');
            const posts = (JSON.parse(existingRaw) as Array<Record<string, unknown>>).filter((p) => p.slug !== slug);
            await fs.writeFile(postsJsonPath, JSON.stringify(posts, null, 2) + '\n', 'utf8');
            await fs.unlink(path.join(POSTS_DIR, `${slug}.md`)).catch(() => {});
            sendJson(res, 200, { ok: true, posts });
            return;
          }

          sendJson(res, 404, { error: 'Unknown CMS endpoint.' });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to save content.' });
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [localCmsPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        blog: path.resolve(__dirname, 'blog/index.html'),
        post: path.resolve(__dirname, 'blog/post.html'),
        atheon: path.resolve(__dirname, 'blog/atheon.html'),
        admin: path.resolve(__dirname, 'admin/index.html'),
      },
    },
  },
});
