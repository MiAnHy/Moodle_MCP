import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';
import { executeMutatingTool } from '../mutation-guard.js';

export const postAnnouncementTool: McpToolDefinition = {
  name: 'moodle_post_announcement',
  description: 'Post an announcement or start a discussion in a course forum with Two-Phase Mutation safeguards.',
  profiles: ['teacher', 'admin', 'all'],
  schema: z.object({
    forumid: z.number().describe('Moodle forum ID to post the announcement into.'),
    subject: z.string().describe('Title or subject of the announcement.'),
    message: z.string().describe('Body message text of the announcement.'),
    dry_run: z.boolean().optional().default(true).describe('If true (default), returns a preview without posting.'),
    confirm: z.boolean().optional().default(false).describe('Must be explicitly true to post the announcement to Moodle.'),
  }),
  execute: async (params, context: ToolExecutionContext): Promise<McpToolResult> => {
    return executeMutatingTool(
      params,
      () => ({
        action: 'mod_forum_add_discussion_post',
        forumid: params.forumid,
        subject: params.subject,
        message_preview: params.message,
      }),
      async () => {
        await context.client.callFunction(
          'mod_forum_add_discussion_post',
          {
            postid: 0,
            subject: params.subject,
            message: params.message,
          },
          context.token
        );

        return {
          success: true,
          forumid: params.forumid,
          subject: params.subject,
          message: 'Announcement successfully posted to Moodle.',
        };
      }
    );
  },
};
