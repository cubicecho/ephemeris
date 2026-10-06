import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { HttpStatus } from '../core/wire.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};
const FALLBACK_MIME = 'application/octet-stream';
const ALLOWED_METHODS = ['GET', 'HEAD'];
/** The page every unknown path gets, because the SPA owns routing. */
const SPA_ENTRY = 'index.html';
/** Where Vite puts its content-hashed bundles. */
const HASHED_ASSETS_PREFIX = '/assets/';
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_REVALIDATE = 'no-cache';
/** Only there so a path-only request URL parses. */
const PLACEHOLDER_ORIGIN = 'http://host';

/**
 * Reads the decoded path out of a request URL.
 *
 * @param url - The request's URL, path and query only.
 * @returns The path, or null when its percent-encoding is malformed.
 */
function decodePathname(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url, PLACEHOLDER_ORIGIN).pathname);
  } catch {
    return null;
  }
}

/**
 * Whether a path names a file that can be sent.
 *
 * @param filePath - Absolute path.
 * @returns True for an existing path that is not a directory.
 */
function isServableFile(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isDirectory() === false;
}

/**
 * Builds the handler that serves the built web client next to /graphql.
 *
 * @param root - Directory holding the client build.
 * @returns A Node request handler.
 *
 * @remarks
 * One container is the whole deployment, and a magic link needs no second origin. Unknown paths fall back to
 * index.html, including /auth/verify?token=… . Hashed bundles under /assets cache forever; the rest revalidates.
 */
export function createStaticHandler(root: string) {
  const rootDir = resolve(root);
  const entryPath = join(rootDir, SPA_ENTRY);

  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? '';
    const isOtherMethod = ALLOWED_METHODS.includes(method) === false;
    if (isOtherMethod) {
      res.writeHead(HttpStatus.MethodNotAllowed, { allow: ALLOWED_METHODS.join(', ') }).end();
      return;
    }

    const pathname = decodePathname(req.url ?? '/');
    if (pathname === null) {
      res.writeHead(HttpStatus.BadRequest).end();
      return;
    }

    const requestedPath = resolve(join(rootDir, normalize(pathname)));
    // normalize() alone does not stop "..%2f" walking out of the root once decoded. Compare the resolved path.
    const isOutsideRoot = requestedPath !== rootDir && requestedPath.startsWith(rootDir + sep) === false;
    if (isOutsideRoot) {
      res.writeHead(HttpStatus.Forbidden).end();
      return;
    }

    const filePath = isServableFile(requestedPath) ? requestedPath : entryPath;
    const isMissing = existsSync(filePath) === false;
    if (isMissing) {
      res.writeHead(HttpStatus.NotFound).end();
      return;
    }

    res.writeHead(HttpStatus.Ok, {
      'content-type': MIME[extname(filePath)] ?? FALLBACK_MIME,
      'cache-control': pathname.startsWith(HASHED_ASSETS_PREFIX) ? CACHE_IMMUTABLE : CACHE_REVALIDATE,
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  };
}
