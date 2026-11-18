import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';

describe('E2E Stdio Handshake & Subprocess Protocol (Ticket 07)', () => {
  const cliEntrypoint = path.resolve(process.cwd(), 'dist/cli/index.js');

  it('spawns moodle-mcp via StdioClientTransport and performs complete handshake', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [cliEntrypoint, '--profile', 'student'],
    });

    const client = new Client(
      {
        name: 'e2e-stdio-tester',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    try {
      await client.connect(transport);

      // Verify tools list over stdio
      const toolsResult = await client.listTools();
      expect(toolsResult.tools.length).toBeGreaterThan(0);
      const names = toolsResult.tools.map((t) => t.name);

      expect(names).toContain('moodle_my_courses');
      expect(names).toContain('moodle_my_deadlines');
      expect(names).toContain('moodle_search_functions');
      expect(names).not.toContain('moodle_create_user');

      // Verify resources list over stdio
      const resourcesResult = await client.listResources();
      expect(resourcesResult.resources.length).toBeGreaterThanOrEqual(1);
      expect(resourcesResult.resources[0].uri).toBe('moodle://site/info');

      // Verify resource templates over stdio
      const templatesResult = await client.listResourceTemplates();
      expect(templatesResult.resourceTemplates.length).toBeGreaterThanOrEqual(2);
    } finally {
      await client.close();
    }
  });

  it('spawns moodle-mcp with teacher profile and lists teacher tools', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [cliEntrypoint, '--profile', 'teacher'],
    });

    const client = new Client(
      {
        name: 'e2e-teacher-tester',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    try {
      await client.connect(transport);

      const toolsResult = await client.listTools();
      const names = toolsResult.tools.map((t) => t.name);

      expect(names).toContain('moodle_list_teacher_courses');
      expect(names).toContain('moodle_submit_grade');
      expect(names).not.toContain('moodle_create_user');
    } finally {
      await client.close();
    }
  });
});
