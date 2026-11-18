import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { pruneCourses } from '../../transformers/course-pruner.js';

export const myCoursesTool: McpToolDefinition = {
  name: 'moodle_my_courses',
  description: 'Retrieve enrolled courses for the student, including course names, IDs, progress, and descriptions.',
  profiles: ['student', 'all'],
  schema: z.object({
    userid: z.number().optional().describe('Optional Moodle user ID. If omitted, automatically resolves to current authenticated user.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    let targetUserId = params.userid;
    if (!targetUserId) {
      if (context.userId) {
        targetUserId = context.userId;
      } else {
        const siteInfo = await context.client.callFunction('core_webservice_get_site_info', {}, context.token);
        targetUserId = siteInfo.userid;
      }
    }

    const coursesRaw = await context.client.callFunction('core_enrol_get_users_courses', { userid: targetUserId }, context.token);
    const pruned = pruneCourses(coursesRaw);

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
