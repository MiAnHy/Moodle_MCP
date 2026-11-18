import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { postForm } from '../../src/moodle/http-transport.js';
import { MoodleNetworkError, MoodleSSRFError } from '../../src/moodle/errors.js';

describe('HTTP Transport Module (Candidate 3)', () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/echo') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: body }));
        });
      } else if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Stream chunks exceeding limit
        const chunk = 'x'.repeat(1024 * 1024);
        for (let i = 0; i < 11; i++) {
          res.write(chunk);
        }
        res.end();
      } else if (req.url === '/error500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Error', status: 500 }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('successfully posts form body and returns parsed JSON', async () => {
    const res = await postForm({
      url: new URL('/echo', serverUrl),
      body: 'foo=bar',
      allowPrivateNetwork: true,
    });
    expect(res).toEqual({ received: 'foo=bar' });
  });

  it('enforces payload size limits and rejects with MoodleNetworkError', async () => {
    await expect(
      postForm({
        url: new URL('/large', serverUrl),
        body: '',
        maxPayloadBytes: 2 * 1024 * 1024, // 2MB limit
        allowPrivateNetwork: true,
      })
    ).rejects.toThrow(MoodleNetworkError);
  });

  it('blocks private IPs when allowPrivateNetwork is false', async () => {
    await expect(
      postForm({
        url: new URL('/echo', serverUrl),
        body: 'test',
        allowPrivateNetwork: false,
      })
    ).rejects.toThrow(MoodleSSRFError);
  });
});
