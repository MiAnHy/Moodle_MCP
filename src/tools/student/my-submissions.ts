import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { semanticPruner } from '../../transformers/index.js';

export const mySubmissionsTool: McpToolDefinition = {
  name: 'moodle_my_submissions',
  description: 'Retrieve submission status, attempt history, submitted files, and grading details for a specific assignment.',
  profiles: ['student', 'all'],
  schema: z.object({
    assignmentid: z.number().describe('Moodle assignment ID.'),
    userid: z.number().optional().describe('Optional student user ID. Defaults to current authenticated student.'),
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

    const raw = await context.client.callFunction(
      'mod_assign_get_submission_status',
      { assignid: params.assignmentid, userid: targetUserId },
      context.token
    );

    const prunedList = semanticPruner.pruneSubmissions(raw);
    const prunedSub = prunedList[0] || {};
    const feedback = raw?.feedback;

    const result = {
      assignmentid: params.assignmentid,
      userid: targetUserId,
      status: prunedSub.status || 'new',
      attemptnumber: prunedSub.attemptnumber ?? 0,
      timemodified: prunedSub.timemodified,
      gradingstatus: raw?.lastattempt?.gradingstatus,
      graded: raw?.lastattempt?.graded ?? false,
      grade_for_display: feedback?.gradefordisplay ?? feedback?.grade?.grade,
      submitted_text: prunedSub.text,
      files: prunedSub.files,
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
