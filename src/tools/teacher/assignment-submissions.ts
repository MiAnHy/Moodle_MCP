import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { pruneSubmissions } from '../../transformers/index.js';

export const getAssignmentSubmissionsTool: McpToolDefinition = {
  name: 'moodle_get_assignment_submissions',
  description: 'List all student submission attempts for an assignment with submitted text and files safely fenced against prompt injection.',
  profiles: ['teacher', 'admin', 'all'],
  schema: z.object({
    assignmentid: z.number().describe('Moodle assignment ID to retrieve submissions for.'),
    status: z.string().optional().describe('Optional filter by submission status (e.g. "submitted", "draft").'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const raw = await context.client.callFunction(
      'mod_assign_get_submissions',
      { assignmentids: [params.assignmentid] },
      context.token
    );

    let pruned = pruneSubmissions(raw);
    if (params.status) {
      pruned = pruned.filter((s) => s.status.toLowerCase() === params.status?.toLowerCase());
    }

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
