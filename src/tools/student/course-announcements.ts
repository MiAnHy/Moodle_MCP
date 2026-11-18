import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { semanticPruner } from '../../transformers/index.js';

export const courseAnnouncementsTool: McpToolDefinition = {
  name: 'moodle_course_announcements',
  description: 'Retrieve announcements and forum discussions for a course, safely fenced against prompt injection.',
  profiles: ['student', 'teacher', 'all'],
  schema: z.object({
    forumid: z.number().describe('Moodle forum ID to fetch announcements/discussions from.'),
    limit: z.number().optional().default(10).describe('Maximum number of discussions to return (default 10).'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const raw = await context.client.callFunction(
      'mod_forum_get_forum_discussions',
      { forumid: params.forumid },
      context.token
    );

    const pruned = semanticPruner.pruneAnnouncements(raw, params.limit);

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
