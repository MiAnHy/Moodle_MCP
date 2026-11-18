import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/tools/registry.js';
import { McpToolDefinition } from '../../src/tools/types.js';

describe('Deep Tool Registry & Schema Cache (Slice 2)', () => {
  const dummyToolA: McpToolDefinition = {
    name: 'test_tool_a',
    description: 'A test student tool',
    profiles: ['student', 'all'],
    schema: z.object({
      id: z.number().describe('Target item ID'),
      optionalNote: z.string().optional().describe('An optional note'),
    }),
    execute: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Result A' }],
    }),
  };

  const dummyToolB: McpToolDefinition = {
    name: 'test_tool_b',
    description: 'A test admin tool',
    profiles: ['admin', 'all'],
    schema: z.object({
      action: z.string().describe('Action name'),
    }),
    execute: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Result B' }],
    }),
  };

  it('indexes tools by name and returns tools for profile', () => {
    const registry = new ToolRegistry([dummyToolA, dummyToolB]);

    const allTools = registry.getToolsForProfile('all');
    expect(allTools).toHaveLength(2);

    const studentTools = registry.getToolsForProfile('student');
    expect(studentTools).toHaveLength(1);
    expect(studentTools[0].name).toBe('test_tool_a');

    const adminTools = registry.getToolsForProfile('admin');
    expect(adminTools).toHaveLength(1);
    expect(adminTools[0].name).toBe('test_tool_b');
  });

  it('precomputes and caches MCP JSON schemas', () => {
    const registry = new ToolRegistry([dummyToolA, dummyToolB]);

    const mcpTools = registry.getMcpToolsForProfile('student');
    expect(mcpTools).toHaveLength(1);
    expect(mcpTools[0].name).toBe('test_tool_a');
    expect(mcpTools[0].description).toBe('A test student tool');
    expect(mcpTools[0].inputSchema.type).toBe('object');
    expect(mcpTools[0].inputSchema.properties).toHaveProperty('id');
    expect(mcpTools[0].inputSchema.required).toContain('id');
    expect(mcpTools[0].inputSchema.additionalProperties).toBe(false);

    // Verify cache stability (reference equality)
    const secondCall = registry.getMcpToolsForProfile('student');
    expect(secondCall).toBe(mcpTools);
  });

  it('dispatches valid tool execution with argument parsing', async () => {
    const registry = new ToolRegistry([dummyToolA]);
    const mockContext: any = { client: {} };

    const result = await registry.dispatchTool(
      'test_tool_a',
      { id: 42, optionalNote: 'hello' },
      mockContext,
      'student'
    );

    expect(dummyToolA.execute).toHaveBeenCalledWith(
      { id: 42, optionalNote: 'hello' },
      mockContext
    );
    expect(result.content[0].text).toBe('Result A');
    expect(result.isError).toBeFalsy();
  });

  it('rejects execution when tool is not accessible for active profile', async () => {
    const registry = new ToolRegistry([dummyToolB]); // admin only
    const mockContext: any = { client: {} };

    const result = await registry.dispatchTool(
      'test_tool_b',
      { action: 'delete' },
      mockContext,
      'student' // calling as student
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found or not active for profile 'student'");
  });

  it('returns standardized error when argument validation fails', async () => {
    const registry = new ToolRegistry([dummyToolA]);
    const mockContext: any = { client: {} };

    const result = await registry.dispatchTool(
      'test_tool_a',
      { id: 'not-a-number' }, // Invalid type
      mockContext,
      'student'
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error executing tool 'test_tool_a'");
  });
});
