import { z } from 'zod';
import { McpToolDefinition, McpToolResult, ToolExecutionContext } from '../types.js';

export const getSiteInfoTool: McpToolDefinition = {
  name: 'moodle_get_site_info',
  description: 'Retrieve Moodle site metadata, site name, release version, user identity, and active web service capabilities.',
  profiles: ['admin', 'all'],
  schema: z.object({}),
  execute: async (_params, context: ToolExecutionContext): Promise<McpToolResult> => {
    const raw = await context.client.callFunction('core_webservice_get_site_info', {}, context.token);

    const pruned = {
      sitename: raw.sitename,
      username: raw.username,
      firstname: raw.firstname,
      lastname: raw.lastname,
      fullname: raw.fullname,
      userid: raw.userid,
      siteurl: raw.siteurl,
      userpictureurl: raw.userpictureurl,
      functions_count: Array.isArray(raw.functions) ? raw.functions.length : 0,
      release: raw.release,
      version: raw.version,
    };

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
