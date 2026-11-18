import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { executeMutatingTool } from '../mutation-guard.js';
import { formatMcpError } from '../../moodle/errors.js';
import { FunctionCatalogService } from './catalog.js';
import { stripSensitiveFields } from '../../transformers/sanitizer.js';

export const executeFunctionTool: McpToolDefinition = {
  name: 'moodle_execute_function',
  description: 'Dynamically invoke any Moodle Core Web Service function with parameter validation and Two-Phase Mutation safeguards.',
  profiles: ['all', 'admin', 'teacher'],
  schema: z.object({
    function_name: z.string().describe('Exact name of the Moodle web service function to invoke.'),
    parameters: z.record(z.any()).optional().default({}).describe('Key-value map of arguments to pass to the Moodle function.'),
    dry_run: z.boolean().optional().default(true).describe('If true (default for mutating operations), returns execution preview.'),
    confirm: z.boolean().optional().default(false).describe('Must be explicitly true to commit mutating operations to Moodle.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const catalog = FunctionCatalogService.getInstance();

    if (!catalog.isAllowed(params.function_name)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Execution of '${params.function_name}' is forbidden by Moodle MCP security policy.`,
            }),
          },
        ],
        isError: true,
      };
    }

    const isMutating = catalog.isMutating(params.function_name);

    if (isMutating) {
      return executeMutatingTool(
        params,
        () => ({
          action: params.function_name,
          parameters: params.parameters,
          is_mutating: true,
        }),
        async () => {
          const rawResult = await context.client.callFunction(
            params.function_name,
            params.parameters,
            context.token
          );
          return stripSensitiveFields(rawResult);
        }
      );
    }

    try {
      const rawResult = await context.client.callFunction(
        params.function_name,
        params.parameters,
        context.token
      );

      const cleaned = stripSensitiveFields(rawResult);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cleaned, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return formatMcpError(err, {
        toolName: 'moodle_execute_function',
        functionName: params.function_name,
      });
    }
  },
};
