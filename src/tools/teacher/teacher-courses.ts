import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { pruneCourses } from '../../transformers/course-pruner.js';

export const listTeacherCoursesTool: McpToolDefinition = {
  name: 'moodle_list_teacher_courses',
  description: 'List all courses taught or managed by the teacher, including enrolled student counts and categories.',
  profiles: ['teacher', 'all'],
  schema: z.object({
    userid: z.number().optional().describe('Optional teacher user ID. Defaults to current authenticated user.'),
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
