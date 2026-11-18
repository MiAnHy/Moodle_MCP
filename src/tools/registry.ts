import { zodToJsonSchema } from 'zod-to-json-schema';
import { formatMcpError } from '../moodle/errors.js';
import {
  McpToolDefinition,
  McpToolResult,
  RoleProfile,
  ToolExecutionContext,
} from './types.js';

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
}

/**
 * Deep Tool Registry module.
 * Consolidates:
 * - Tool indexing by name for O(1) retrieval
 * - Profile-based tool accessibility filtering
 * - Startup pre-computation and caching of MCP-compliant JSON Schemas
 * - Unified tool execution dispatching with parameter validation and error boundary
 */
export class ToolRegistry {
  private readonly toolsByName: Map<string, McpToolDefinition> = new Map();
  private readonly toolsByProfile: Map<RoleProfile, McpToolDefinition[]> = new Map();
  private readonly schemaCacheByProfile: Map<RoleProfile, McpToolDescriptor[]> = new Map();

  constructor(tools: McpToolDefinition[]) {
    for (const tool of tools) {
      if (!this.toolsByName.has(tool.name)) {
        this.toolsByName.set(tool.name, tool);
      }
    }

    const profiles: RoleProfile[] = ['all', 'student', 'teacher', 'admin'];

    for (const profile of profiles) {
      let activeTools: McpToolDefinition[];
      if (profile === 'all') {
        activeTools = Array.from(this.toolsByName.values());
      } else {
        activeTools = Array.from(this.toolsByName.values()).filter((t) =>
          t.profiles.includes(profile)
        );
      }
      this.toolsByProfile.set(profile, activeTools);

      const descriptors: McpToolDescriptor[] = activeTools.map((tool) => {
        const jsonSchema = zodToJsonSchema(tool.schema, { target: 'jsonSchema7' }) as any;
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: 'object',
            properties: jsonSchema.properties || {},
            required: jsonSchema.required || [],
            additionalProperties: false,
          },
        };
      });

      this.schemaCacheByProfile.set(profile, descriptors);
    }
  }

  getToolsForProfile(profile: RoleProfile = 'all'): McpToolDefinition[] {
    return this.toolsByProfile.get(profile) || [];
  }

  getMcpToolsForProfile(profile: RoleProfile = 'all'): McpToolDescriptor[] {
    return this.schemaCacheByProfile.get(profile) || [];
  }

  getTool(name: string): McpToolDefinition | undefined {
    return this.toolsByName.get(name);
  }

  async dispatchTool(
    name: string,
    args: unknown,
    context: ToolExecutionContext,
    profile: RoleProfile = 'all'
  ): Promise<McpToolResult> {
    const tool = this.toolsByName.get(name);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool '${name}' is not found or not active for profile '${profile}'.`,
          },
        ],
        isError: true,
      };
    }

    if (profile !== 'all' && !tool.profiles.includes(profile)) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool '${name}' is not found or not active for profile '${profile}'.`,
          },
        ],
        isError: true,
      };
    }

    try {
      const parsedArgs = tool.schema.parse(args ?? {});
      return await tool.execute(parsedArgs, context);
    } catch (error: any) {
      return formatMcpError(error, { toolName: name });
    }
  }
}
