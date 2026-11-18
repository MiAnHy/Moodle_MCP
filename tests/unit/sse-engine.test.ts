import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { createSseEngine, SseEngine } from '../../src/transport/sse-engine.js';

describe('Decoupled Multi-Tenant SSE Engine (Slice 4)', () => {
  let engine: SseEngine | null = null;
  let server: http.Server | null = null;
  let baseUrl: string = '';

  const startTestServer = async (eng: SseEngine): Promise<string> => {
    engine = eng;
    return new Promise((resolve) => {
      server = eng.app.listen(0, () => {
        const address = server!.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve(baseUrl);
      });
    });
  };

  afterEach(async () => {
    if (engine) {
      engine.destroy();
      engine = null;
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('GET /health returns 200 OK with server status and profile info', async () => {
    const eng = createSseEngine({ profile: 'teacher' });
    const url = await startTestServer(eng);

    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.server).toBe('moodle-mcp');
    expect(body.profile).toBe('teacher');
    expect(body.activeSessions).toBe(0);
    expect(body.timestamp).toBeDefined();
  });

  it('POST /messages returns 400 when sessionId is missing', async () => {
    const eng = createSseEngine();
    const url = await startTestServer(eng);

    const res = await fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Missing sessionId');
  });

  it('POST /messages returns 404 when sessionId is not registered', async () => {
    const eng = createSseEngine();
    const url = await startTestServer(eng);

    const res = await fetch(`${url}/messages?sessionId=non-existent-session-123`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Session not found: non-existent-session-123');
  });

  it('prunes idle sessions exceeding idleTimeoutMs threshold', () => {
    const eng = createSseEngine({ idleTimeoutMs: 1000 }); // 1 second timeout
    const activeMap = eng.getActiveSessions();

    const mockSession: any = {
      sessionId: 'session-old',
      transport: { close: () => {} },
      server: {},
      createdAt: new Date(Date.now() - 5000),
      lastActiveAt: new Date(Date.now() - 2000), // 2 seconds ago (idle > 1s)
    };

    activeMap.set('session-old', mockSession);
    expect(eng.getActiveSessionCount()).toBe(1);

    const prunedCount = eng.pruneIdleSessions();
    expect(prunedCount).toBe(1);
    expect(eng.getActiveSessionCount()).toBe(0);
  });

  it('closeAllSessions clears all active registered sessions', () => {
    const eng = createSseEngine();
    const activeMap = eng.getActiveSessions();

    activeMap.set('session-1', {
      sessionId: 'session-1',
      transport: { close: () => {} } as any,
      server: {} as any,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });
    activeMap.set('session-2', {
      sessionId: 'session-2',
      transport: { close: () => {} } as any,
      server: {} as any,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });

    expect(eng.getActiveSessionCount()).toBe(2);
    eng.closeAllSessions();
    expect(eng.getActiveSessionCount()).toBe(0);
  });
});
