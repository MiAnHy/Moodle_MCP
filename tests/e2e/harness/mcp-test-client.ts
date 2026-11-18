/**
 * tests/e2e/harness/mcp-test-client.ts
 *
 * Opaque-Box MCP Test Client Harness for Universal Moodle MCP Server.
 * Supports InMemoryTransport, StdioClientTransport, and SSEClientTransport.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Tool, Resource } from '@modelcontextprotocol/sdk/types.js';
import type { Readable } from 'node:stream';

export type RoleProfile = 'student' | 'teacher' | 'admin' | 'all';

export interface McpToolCallResult<T = any> {
  isError: boolean;
  text?: string;
  data?: T;
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: any;
    [key: string]: unknown;
  }>;
  raw: any;
}

export interface McpResourceResult {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

export interface TwoPhasePreview {
  status: 'preview';
  operation: string;
  description?: string;
  targetId?: number | string;
  proposedChanges: Record<string, any>;
  confirmationRequired: true;
}

export interface TwoPhaseCommitted<T = any> {
  status: 'committed';
  operation: string;
  success: boolean;
  data: T;
}

export interface InMemoryClientOptions {
  profile?: RoleProfile;
  token?: string;
  moodleBaseUrl?: string;
  server?: any;
  serverFactory?: (options: {
    profile: RoleProfile;
    token?: string;
    moodleBaseUrl?: string;
  }) => Promise<any> | any;
}

export interface StdioClientOptions {
  command?: string;
  args?: string[];
  profile?: RoleProfile;
  token?: string;
  moodleUrl?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface SseClientOptions {
  url: string | URL;
  token?: string;
  timeoutMs?: number;
}

// Standalone Assertion Helpers
export function assertSuccess<T = any>(result: McpToolCallResult<T>): T {
  if (result.isError) {
    throw new Error(`Expected tool call to succeed, but got error: ${result.text}`);
  }
  return (result.data !== undefined ? result.data : result.text) as unknown as T;
}

export function assertError(result: McpToolCallResult, pattern?: string | RegExp): void {
  if (!result.isError) {
    throw new Error(
      `Expected tool call to fail with error, but succeeded: ${JSON.stringify(result.data ?? result.text)}`
    );
  }
  if (pattern && result.text) {
    if (typeof pattern === 'string') {
      if (!result.text.includes(pattern)) {
        throw new Error(`Expected error message to contain "${pattern}", but got "${result.text}"`);
      }
    } else if (!pattern.test(result.text)) {
      throw new Error(`Expected error message to match ${pattern}, but got "${result.text}"`);
    }
  }
}

export function assertTwoPhasePreview(
  result: McpToolCallResult,
  expectedOperation?: string
): TwoPhasePreview {
  const data = assertSuccess<any>(result);
  if (!data || typeof data !== 'object') {
    throw new Error(`Expected preview response object, got ${typeof data}`);
  }
  if (data.status !== 'preview') {
    throw new Error(`Expected status === "preview", got "${data.status}"`);
  }
  if (data.confirmationRequired !== true) {
    throw new Error(`Expected confirmationRequired === true, got ${data.confirmationRequired}`);
  }
  if (!data.proposedChanges || typeof data.proposedChanges !== 'object') {
    throw new Error(`Expected proposedChanges object in preview, got ${typeof data.proposedChanges}`);
  }
  if (expectedOperation && data.operation !== expectedOperation) {
    throw new Error(`Expected operation === "${expectedOperation}", got "${data.operation}"`);
  }
  return data as TwoPhasePreview;
}

export function assertTwoPhaseCommitted<T = any>(
  result: McpToolCallResult,
  expectedOperation?: string
): TwoPhaseCommitted<T> {
  const data = assertSuccess<any>(result);
  if (!data || typeof data !== 'object') {
    throw new Error(`Expected committed response object, got ${typeof data}`);
  }
  if (data.status !== 'committed') {
    throw new Error(`Expected status === "committed", got "${data.status}"`);
  }
  if (data.success !== true) {
    throw new Error(`Expected success === true, got ${data.success}`);
  }
  if (expectedOperation && data.operation !== expectedOperation) {
    throw new Error(`Expected operation === "${expectedOperation}", got "${data.operation}"`);
  }
  return data as TwoPhaseCommitted<T>;
}

export function assertUntrustedFenced(target: string | McpToolCallResult): void {
  const text = typeof target === 'string' ? target : (target.text ?? JSON.stringify(target.data));
  const startTag = '<user_content untrusted="true">';
  const endTag = '</user_content>';

  if (!text || !text.includes(startTag) || !text.includes(endTag)) {
    throw new Error(
      `Expected content to be enclosed in <user_content untrusted="true"> fences. Got: ${text?.slice(0, 300)}...`
    );
  }

  const startIndex = text.indexOf(startTag);
  const endIndex = text.lastIndexOf(endTag);
  if (endIndex < startIndex) {
    throw new Error('Malformed fence: closing </user_content> appears before start tag.');
  }
}

export function assertPiiStripped(target: unknown): void {
  const forbidden = [
    'password',
    'passwordhash',
    'hash',
    'salt',
    'secret',
    'authcode',
    'sessionkey',
    'userprivateaccesskey',
  ];

  const checkObject = (obj: any, path: string = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (forbidden.some((f) => lower.includes(f))) {
        if (val !== undefined && val !== null && val !== '') {
          throw new Error(
            `PII violation: found forbidden field "${path ? path + '.' : ''}${key}" with sensitive data.`
          );
        }
      }
      if (typeof val === 'object' && val !== null) {
        checkObject(val, path ? `${path}.${key}` : key);
      }
    }
  };

  checkObject(target);
}

export function assertTokenReduction(
  originalHtml: string,
  resultMarkdown: string,
  minRatio: number = 0.80
): void {
  if (!originalHtml || originalHtml.length === 0) return;
  const reduction = (originalHtml.length - resultMarkdown.length) / originalHtml.length;
  if (reduction < minRatio) {
    throw new Error(
      `Expected token reduction >= ${(minRatio * 100).toFixed(0)}%, but got ${(reduction * 100).toFixed(1)}% (HTML: ${originalHtml.length} chars, MD: ${resultMarkdown.length} chars)`
    );
  }
}

export class McpTestClient {
  private client: Client;
  private transport: Transport;
  private serverInstance?: any;
  private stderrBuffer: string[] = [];

  constructor(client: Client, transport: Transport, serverInstance?: any) {
    this.client = client;
    this.transport = transport;
    this.serverInstance = serverInstance;

    // Attach stderr listener if transport is StdioClientTransport
    if (transport instanceof StdioClientTransport && transport.stderr) {
      (transport.stderr as Readable).on('data', (chunk: Buffer) => {
        this.stderrBuffer.push(chunk.toString('utf-8'));
      });
    }
  }

  // --- Factory Methods ---

  static async createInMemory(options: InMemoryClientOptions = {}): Promise<McpTestClient> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    let server = options.server;
    if (!server && options.serverFactory) {
      server = await options.serverFactory({
        profile: options.profile ?? 'all',
        token: options.token,
        moodleBaseUrl: options.moodleBaseUrl,
      });
    }

    if (server && typeof server.connect === 'function') {
      await server.connect(serverTransport);
    }

    const client = new Client(
      { name: 'moodle-e2e-inmemory-client', version: '1.0.0' },
      { capabilities: { roots: {}, sampling: {} } }
    );

    await client.connect(clientTransport);
    return new McpTestClient(client, clientTransport, server);
  }

  static async createStdio(options: StdioClientOptions = {}): Promise<McpTestClient> {
    const profile = options.profile ?? 'all';
    const command = options.command ?? 'node';
    const args = options.args ?? ['./dist/cli/index.js', '--transport', 'stdio', '--profile', profile];

    const env: Record<string, string> = {
      ...process.env,
      ...options.env,
    };
    if (options.moodleUrl) env.MOODLE_URL = options.moodleUrl;
    if (options.token) env.MOODLE_TOKEN = options.token;

    const transport = new StdioClientTransport({
      command,
      args,
      env,
      cwd: options.cwd ?? process.cwd(),
      stderr: 'pipe',
    });

    const client = new Client(
      { name: 'moodle-e2e-stdio-client', version: '1.0.0' },
      { capabilities: { roots: {}, sampling: {} } }
    );

    await client.connect(transport);
    return new McpTestClient(client, transport);
  }

  static async createSse(options: SseClientOptions): Promise<McpTestClient> {
    const url = typeof options.url === 'string' ? new URL(options.url) : options.url;
    const headers: Record<string, string> = {};
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const transport = new SSEClientTransport(url, {
      eventSourceInit: { headers },
      requestInit: { headers },
    });

    const client = new Client(
      { name: 'moodle-e2e-sse-client', version: '1.0.0' },
      { capabilities: { roots: {}, sampling: {} } }
    );

    await client.connect(transport);
    return new McpTestClient(client, transport);
  }

  // --- Discovery Operations ---

  async listTools(): Promise<Tool[]> {
    const result = await this.client.listTools();
    return result.tools ?? [];
  }

  async hasTool(toolName: string): Promise<boolean> {
    const tools = await this.listTools();
    return tools.some((t) => t.name === toolName);
  }

  async getTool(toolName: string): Promise<Tool | undefined> {
    const tools = await this.listTools();
    return tools.find((t) => t.name === toolName);
  }

  async listResources(): Promise<Resource[]> {
    const result = await this.client.listResources();
    return result.resources ?? [];
  }

  async hasResource(uri: string): Promise<boolean> {
    const resources = await this.listResources();
    return resources.some((r) => r.uri === uri);
  }

  async getResource(uri: string): Promise<Resource | undefined> {
    const resources = await this.listResources();
    return resources.find((r) => r.uri === uri);
  }

  // --- Invocation Operations ---

  async callTool<T = any>(
    name: string,
    args: Record<string, unknown> = {},
    options?: { timeoutMs?: number }
  ): Promise<McpToolCallResult<T>> {
    try {
      const rawResult = await this.client.callTool({
        name,
        arguments: args,
      });

      const isError = Boolean((rawResult as any).isError);
      const content = ((rawResult as any).content ?? []) as Array<any>;
      const textBlock = content.find((c) => c.type === 'text');
      const text = textBlock?.text;

      let data: T | undefined = undefined;
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          // Plain text response, leave data undefined
        }
      }

      return {
        isError,
        text,
        data,
        content,
        raw: rawResult,
      };
    } catch (error: any) {
      return {
        isError: true,
        text: error.message || String(error),
        content: [{ type: 'text', text: error.message || String(error) }],
        raw: error,
      };
    }
  }

  async readResource(uri: string): Promise<McpResourceResult> {
    const raw = await this.client.readResource({ uri });
    const contents = (raw.contents ?? []) as any[];
    const first = contents[0];
    return {
      uri: first?.uri ?? uri,
      mimeType: first?.mimeType,
      text: first?.text,
      blob: first?.blob,
      contents,
    };
  }

  // --- Diagnostics & Teardown ---

  getStderr(): string {
    return this.stderrBuffer.join('');
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // Ignore transport close errors during teardown
    }
    if (this.serverInstance && typeof this.serverInstance.close === 'function') {
      try {
        await this.serverInstance.close();
      } catch {
        // Ignore server close errors
      }
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // --- Instance Delegated Contract Assertions ---

  assertSuccess<T = any>(result: McpToolCallResult<T>): T {
    return assertSuccess(result);
  }

  assertError(result: McpToolCallResult, pattern?: string | RegExp): void {
    assertError(result, pattern);
  }

  assertTwoPhasePreview(result: McpToolCallResult, expectedOperation?: string): TwoPhasePreview {
    return assertTwoPhasePreview(result, expectedOperation);
  }

  assertTwoPhaseCommitted<T = any>(result: McpToolCallResult, expectedOperation?: string): TwoPhaseCommitted<T> {
    return assertTwoPhaseCommitted(result, expectedOperation);
  }

  assertUntrustedFenced(target: string | McpToolCallResult): void {
    assertUntrustedFenced(target);
  }

  assertPiiStripped(target: unknown): void {
    assertPiiStripped(target);
  }

  assertTokenReduction(originalHtml: string, resultMarkdown: string, minRatio: number = 0.80): void {
    assertTokenReduction(originalHtml, resultMarkdown, minRatio);
  }
}
