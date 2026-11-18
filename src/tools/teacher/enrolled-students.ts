import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { pruneUsers } from '../../transformers/user-pruner.js';

export const getEnrolledStudentsTool: McpToolDefinition = {
  name: 'moodle_get_enrolled_students',
  description: 'Retrieve enrolled students and users in a course with identity details, roles, and emails.',
  profiles: ['teacher', 'admin', 'all'],
  schema: z.object({
    courseid: z.number().describe('Moodle course ID to retrieve enrolled users for.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const rawUsers = await context.client.callFunction(
      'core_enrol_get_enrolled_users',
      { courseid: params.courseid },
      context.token
    );

    const pruned = pruneUsers(rawUsers);

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
