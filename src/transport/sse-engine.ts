import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMoodleServer, MoodleServerOptions } from '../server.js';
import { MoodleRestClient } from '../moodle/client.js';
import { MoodleClient } from '../types/moodle.js';
import { RoleProfile } from '../tools/types.js';

export interface SseSession {
  sessionId: string;
  transport: SSEServerTransport;
  server: Server;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SseEngineOptions {
  profile?: RoleProfile;
  defaultUrl?: string;
  defaultToken?: string;
  idleTimeoutMs?: number; // 0 to disable periodic sweep, default 30 min
  createClient?: (baseUrl: string, defaultToken?: string) => MoodleClient;
  createServer?: (options: MoodleServerOptions) => Server;
}

export interface SseEngine {
  app: express.Express;
  getActiveSessionCount: () => number;
  getActiveSessions: () => Map<string, SseSession>;
  closeAllSessions: () => Promise<void>;
  pruneIdleSessions: () => number;
  destroy: () => void;
}

/**
 * Creates a decoupled, multi-tenant Server-Sent Events (SSE) HTTP transport engine.
 * Encapsulates:
 * - Express HTTP routes (/health, /sse, /messages)
 * - Session-scoped token & URL isolation (ADR-0009)
 * - Active session tracking & lifecycle teardown
 * - Inactive session idle pruning
 */
export function createSseEngine(options: SseEngineOptions = {}): SseEngine {
  const profile = options.profile || 'all';
  const defaultUrl = options.defaultUrl || 'http://localhost/moodle';
  const defaultToken = options.defaultToken;
  const idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000; // 30 minutes

  const app = express();
  app.use(express.json());

  const activeSessions = new Map<string, SseSession>();

  // Prune idle sessions
  const pruneIdleSessions = (): number => {
    if (idleTimeoutMs <= 0) return 0;
    const now = Date.now();
    let pruned = 0;
    for (const [sessionId, session] of activeSessions.entries()) {
      if (now - session.lastActiveAt.getTime() > idleTimeoutMs) {
        try {
          session.transport.close?.();
        } catch {
          // ignore error on close
        }
        activeSessions.delete(sessionId);
        pruned++;
      }
    }
    return pruned;
  };

  let sweepTimer: NodeJS.Timeout | null = null;
  if (idleTimeoutMs > 0) {
    sweepTimer = setInterval(pruneIdleSessions, Math.min(idleTimeoutMs, 5 * 60 * 1000));
    sweepTimer.unref();
  }

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: 'moodle-mcp',
      profile,
      activeSessions: activeSessions.size,
      timestamp: new Date().toISOString(),
    });
  });

  // SSE stream endpoint
  app.get('/sse', async (req, res) => {
    // 1. Session-Scoped Token Isolation per ADR 0009
    let token = defaultToken;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (typeof req.query.token === 'string') {
      token = req.query.token;
    }

    const moodleUrl =
      (typeof req.headers['x-moodle-url'] === 'string'
        ? req.headers['x-moodle-url']
        : typeof req.query.url === 'string'
        ? req.query.url
        : defaultUrl) || 'http://localhost/moodle';

    // Create isolated per-session client
    const sessionClient = options.createClient
      ? options.createClient(moodleUrl, token)
      : new MoodleRestClient({ baseUrl: moodleUrl, defaultToken: token });

    const transport = new SSEServerTransport('/messages', res);
    const server = options.createServer
      ? options.createServer({ profile, client: sessionClient, token })
      : createMoodleServer({ profile, client: sessionClient, token });

    const sessionId = transport.sessionId;
    const session: SseSession = {
      sessionId,
      transport,
      server,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    activeSessions.set(sessionId, session);

    transport.onclose = () => {
      activeSessions.delete(sessionId);
    };

    await server.connect(transport);
  });

  // Incoming POST messages for SSE sessions
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }

    session.lastActiveAt = new Date();
    await session.transport.handlePostMessage(req, res);
  });

  const closeAllSessions = async (): Promise<void> => {
    for (const [sessionId, session] of activeSessions.entries()) {
      try {
        session.transport.close?.();
      } catch {
        // ignore
      }
    }
    activeSessions.clear();
  };

  const destroy = (): void => {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    closeAllSessions();
  };

  return {
    app,
    getActiveSessionCount: () => activeSessions.size,
    getActiveSessions: () => activeSessions,
    closeAllSessions,
    pruneIdleSessions,
    destroy,
  };
}
