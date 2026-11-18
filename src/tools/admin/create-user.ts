import { randomBytes } from 'crypto';
import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { executeMutatingTool } from '../mutation-guard.js';

export const createUserTool: McpToolDefinition = {
  name: 'moodle_create_user',
  description: 'Provision a new user account in Moodle with Two-Phase Mutation safeguards.',
  profiles: ['admin', 'all'],
  schema: z.object({
    username: z.string().min(2).describe('Unique username for the new account.'),
    email: z.string().email().describe('Valid email address for the user.'),
    firstname: z.string().min(1).describe('First name of the user.'),
    lastname: z.string().min(1).describe('Last name of the user.'),
    password: z.string().optional().describe('Initial password. If omitted, Moodle may generate a random password.'),
    dry_run: z.boolean().optional().default(true).describe('If true (default), returns a preview of the account creation without committing.'),
    confirm: z.boolean().optional().default(false).describe('Must be explicitly true to create the user account in Moodle.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    return executeMutatingTool(
      params,
      () => ({
        action: 'core_user_create_users',
        username: params.username,
        email: params.email,
        fullname: `${params.firstname} ${params.lastname}`,
      }),
      async () => {
        const newUserPayload = {
          username: params.username.toLowerCase(),
          email: params.email,
          firstname: params.firstname,
          lastname: params.lastname,
          password: params.password ?? `Tmp_${randomBytes(12).toString('base64url')}!`,
          auth: 'manual',
        };

        const res = await context.client.callFunction(
          'core_user_create_users',
          {
            users: [newUserPayload],
          },
          context.token
        );

        const created = Array.isArray(res) ? res[0] : res;
        return {
          success: true,
          action: 'core_user_create_users',
          id: created?.id,
          username: created?.username ?? params.username,
          message: `User account '${params.username}' successfully created.`,
        };
      }
    );
  },
};
