import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { semanticPruner } from '../../transformers/index.js';

export const myDeadlinesTool: McpToolDefinition = {
  name: 'moodle_my_deadlines',
  description: 'Retrieve upcoming assignment due dates, quiz close dates, and calendar events for the student.',
  profiles: ['student', 'all'],
  schema: z.object({
    courseid: z.number().optional().describe('Filter events by specific Moodle course ID.'),
    timesortfrom: z.number().optional().describe('Epoch timestamp filter for events starting after this time.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    let result: any;
    if (params.courseid) {
      result = await context.client.callFunction(
        'core_calendar_get_action_events_by_course',
        { courseid: params.courseid, timesortfrom: params.timesortfrom ?? 0 },
        context.token
      );
    } else {
      result = await context.client.callFunction(
        'core_calendar_get_action_events_by_timesort',
        { timesortfrom: params.timesortfrom ?? 0 },
        context.token
      );
    }

    const pruned = semanticPruner.pruneDeadlines(result);

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
