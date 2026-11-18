import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { executeMutatingTool } from '../mutation-guard.js';

export const enrolUserTool: McpToolDefinition = {
  name: 'moodle_enrol_user',
  description: 'Enroll a user into a Moodle course with a designated role (e.g. Student, Teacher) with Two-Phase Mutation safeguards.',
  profiles: ['admin', 'all'],
  schema: z.object({
    courseid: z.number().describe('Moodle course ID to enroll the user into.'),
    userid: z.number().describe('Moodle user ID to be enrolled.'),
    roleid: z.number().optional().default(5).describe('Moodle role ID (5 = Student, 3 = Editing Teacher, 4 = Non-editing Teacher). Default is 5.'),
    dry_run: z.boolean().optional().default(true).describe('If true (default), returns a preview without enrolling the user.'),
    confirm: z.boolean().optional().default(false).describe('Must be explicitly true to execute the enrollment in Moodle.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const roleName =
      params.roleid === 3
        ? 'Teacher'
        : params.roleid === 4
        ? 'Non-editing Teacher'
        : params.roleid === 5
        ? 'Student'
        : `Role ${params.roleid}`;

    return executeMutatingTool(
      params,
      () => ({
        action: 'enrol_manual_enrol_users',
        courseid: params.courseid,
        userid: params.userid,
        roleid: params.roleid,
        role_name: roleName,
      }),
      async () => {
        const enrolment = {
          roleid: params.roleid,
          userid: params.userid,
          courseid: params.courseid,
        };

        await context.client.callFunction(
          'enrol_manual_enrol_users',
          {
            enrolments: [enrolment],
          },
          context.token
        );

        return {
          success: true,
          action: 'enrol_manual_enrol_users',
          courseid: params.courseid,
          userid: params.userid,
          roleid: params.roleid,
          message: `User ID ${params.userid} successfully enrolled in Course ID ${params.courseid}.`,
        };
      }
    );
  },
};
