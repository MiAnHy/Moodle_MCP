import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { executeMutatingTool } from '../mutation-guard.js';

export const submitGradeTool: McpToolDefinition = {
  name: 'moodle_submit_grade',
  description: 'Grade a student assignment submission with Two-Phase Mutation safeguards. Defaults to dry-run preview mode.',
  profiles: ['teacher', 'admin', 'all'],
  schema: z.object({
    assignmentid: z.number().describe('Moodle assignment ID to grade.'),
    userid: z.number().describe('Moodle student user ID being graded.'),
    grade: z.number().describe('Numerical grade or score to assign (e.g. 95.5).'),
    feedback: z.string().optional().describe('Constructive feedback comments for the student.'),
    attemptnumber: z.number().optional().default(-1).describe('Submission attempt number (-1 for latest).'),
    dry_run: z.boolean().optional().default(true).describe('If true (default), returns a preview of the proposed grade change without touching Moodle.'),
    confirm: z.boolean().optional().default(false).describe('Must be explicitly true to commit the grade change to Moodle.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    return executeMutatingTool(
      params,
      () => ({
        action: 'mod_assign_save_grade',
        assignmentid: params.assignmentid,
        userid: params.userid,
        proposed_grade: params.grade,
        feedback: params.feedback ?? '',
      }),
      async () => {
        const mutationParams: Record<string, any> = {
          assignmentid: params.assignmentid,
          userid: params.userid,
          grade: params.grade,
          attemptnumber: params.attemptnumber ?? -1,
          addattempt: 0,
          workflowstate: 'graded',
          applytoall: 1,
        };

        if (params.feedback) {
          mutationParams['plugindata[assignfeedbackcomments_editor][text]'] = params.feedback;
          mutationParams['plugindata[assignfeedbackcomments_editor][format]'] = 1;
        }

        await context.client.callFunction('mod_assign_save_grade', mutationParams, context.token);

        return {
          success: true,
          action: 'mod_assign_save_grade',
          assignmentid: params.assignmentid,
          userid: params.userid,
          grade: params.grade,
          feedback: params.feedback ?? '',
          message: 'Grade and feedback successfully published to Moodle.',
        };
      }
    );
  },
};
