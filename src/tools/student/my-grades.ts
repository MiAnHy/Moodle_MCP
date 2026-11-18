import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { pruneGrades } from '../../transformers/grade-pruner.js';

export const myGradesTool: McpToolDefinition = {
  name: 'moodle_my_grades',
  description: 'Retrieve grades, percentages, max points, and instructor feedback for a specific enrolled course.',
  profiles: ['student', 'all'],
  schema: z.object({
    courseid: z.number().describe('Moodle course ID to query grades for.'),
    userid: z.number().optional().describe('Optional student user ID. Defaults to the authenticated student.'),
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

    const rawGrades = await context.client.callFunction(
      'gradereport_user_get_grade_items',
      { courseid: params.courseid, userid: targetUserId },
      context.token
    );

    const pruned = pruneGrades(rawGrades);

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
