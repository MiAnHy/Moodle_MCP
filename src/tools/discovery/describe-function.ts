import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { FunctionCatalogService } from './catalog.js';

export const describeFunctionTool: McpToolDefinition = {
  name: 'moodle_describe_function',
  description: 'Inspect parameter requirements, types, and return specifications for any Moodle web service function.',
  profiles: ['all', 'admin', 'teacher', 'student'],
  schema: z.object({
    function_name: z.string().describe('Exact name of the Moodle web service function (e.g. core_course_get_courses).'),
  }),
  execute: async (params, _context: ToolExecutionContext): Promise<McpToolResult> => {
    const catalog = FunctionCatalogService.getInstance();
    const entry = catalog.describe(params.function_name);

    if (!entry) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Function '${params.function_name}' not found in catalog or is blocked by security policy.`,
            }),
          },
        ],
        isError: true,
      };
    }

    const result = {
      name: entry.name,
      description: entry.description,
      component: entry.component,
      is_mutating: catalog.isMutating(entry.name),
      parameters: entry.parameters,
      returns: entry.returns,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};
