import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { FunctionCatalogService } from './catalog.js';

export const searchFunctionsTool: McpToolDefinition = {
  name: 'moodle_search_functions',
  description: 'Search across Moodle Core Web Services directory by keyword (e.g. "quiz", "cohort", "badge", "grade").',
  profiles: ['all', 'admin', 'teacher', 'student'],
  schema: z.object({
    query: z.string().describe('Search keyword or component name.'),
    limit: z.number().optional().default(10).describe('Max results to return (default 10).'),
  }),
  execute: async (params, _context: ToolExecutionContext): Promise<McpToolResult> => {
    const catalog = FunctionCatalogService.getInstance();
    const results = catalog.search(params.query, params.limit);

    const summaries = results.map((fn) => ({
      name: fn.name,
      description: fn.description,
      component: fn.component,
      mutating: catalog.isMutating(fn.name),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(summaries, null, 2),
        },
      ],
    };
  },
};
