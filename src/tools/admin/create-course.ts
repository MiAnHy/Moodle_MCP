import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { executeMutatingTool } from '../mutation-guard.js';

export const createCourseTool: McpToolDefinition = {
  name: 'moodle_create_course',
  description: 'Create a new course in Moodle under a category with Two-Phase Mutation safeguards.',
  profiles: ['admin', 'all'],
  schema: z.object({
    fullname: z.string().min(2).describe('Full name of the new course.'),
    shortname: z.string().min(2).describe('Unique shortname/course code (e.g. CS102).'),
    categoryid: z.number().optional().default(1).describe('Course category ID (default 1).'),
    summary: z.string().optional().describe('Introductory course summary text.'),
    dry_run: z.boolean().optional().default(true).describe('If true (default), returns a preview without creating the course.'),
    confirm: z.boolean().optional().default(false).describe('Must be explicitly true to create the course in Moodle.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    return executeMutatingTool(
      params,
      () => ({
        action: 'core_course_create_courses',
        fullname: params.fullname,
        shortname: params.shortname,
        categoryid: params.categoryid,
        summary: params.summary ?? '',
      }),
      async () => {
        const coursePayload = {
          fullname: params.fullname,
          shortname: params.shortname,
          categoryid: params.categoryid,
          summary: params.summary ?? '',
          format: 'topics',
        };

        const res = await context.client.callFunction(
          'core_course_create_courses',
          {
            courses: [coursePayload],
          },
          context.token
        );

        const created = Array.isArray(res) ? res[0] : res;
        return {
          success: true,
          action: 'core_course_create_courses',
          id: created?.id,
          shortname: created?.shortname ?? params.shortname,
          message: `Course '${params.fullname}' (${params.shortname}) successfully created.`,
        };
      }
    );
  },
};
