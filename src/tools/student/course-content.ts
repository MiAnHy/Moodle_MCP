import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { semanticPruner } from '../../transformers/index.js';

export const courseContentTool: McpToolDefinition = {
  name: 'moodle_get_course_content',
  description: 'Retrieve course syllabus, sections, modules, lecture notes, and downloadable study resources in clean Markdown.',
  profiles: ['student', 'teacher', 'all'],
  schema: z.object({
    courseid: z.number().describe('Moodle course ID to retrieve contents for.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const rawSections = await context.client.callFunction(
      'core_course_get_contents',
      { courseid: params.courseid },
      context.token
    );

    const pruned = semanticPruner.pruneCourseContents(rawSections);

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
