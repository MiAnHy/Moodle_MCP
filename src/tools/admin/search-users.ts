import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { pruneUsers } from '../../transformers/user-pruner.js';

export const searchUsersTool: McpToolDefinition = {
  name: 'moodle_search_users',
  description: 'Search Moodle user accounts by email, username, firstname, or lastname.',
  profiles: ['admin', 'all'],
  schema: z.object({
    key: z.enum(['email', 'username', 'firstname', 'lastname', 'id']).optional().default('email').describe('Field to search by.'),
    value: z.string().describe('Search value or query pattern.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const raw = await context.client.callFunction(
      'core_user_get_users',
      {
        'criteria[0][key]': params.key,
        'criteria[0][value]': params.value,
        criteria: [{ key: params.key, value: params.value }],
      },
      context.token
    );

    const usersList = raw?.users ?? (Array.isArray(raw) ? raw : []);
    const pruned = pruneUsers(usersList);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(pruned, null, 2),
        },
      ],
    };
  },
};
