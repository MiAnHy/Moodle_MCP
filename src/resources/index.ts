import { MoodleClient } from '../types/moodle.js';
import { semanticPruner } from '../transformers/index.js';

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  mimeType: string;
  description: string;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

export const staticResources: ResourceDefinition[] = [
  {
    uri: 'moodle://site/info',
    name: 'Site Information',
    mimeType: 'application/json',
    description: 'Current Moodle site version, release, sitename, and authenticated user overview.',
  },
];

export const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: 'moodle://courses/{courseId}/syllabus',
    name: 'Course Syllabus',
    mimeType: 'text/markdown',
    description: 'Structured course syllabus, weekly outline, modules, and activity descriptions in Markdown.',
  },
  {
    uriTemplate: 'moodle://courses/{courseId}/contents',
    name: 'Course Contents Tree',
    mimeType: 'application/json',
    description: 'Complete hierarchical sections, modules, assignments, and resources for a course.',
  },
];

interface ResourceHandlerResult {
  mimeType: string;
  text: string;
}

interface ResourceRoute {
  match: (uri: string) => Record<string, any> | null;
  handler: (
    params: Record<string, any>,
    client: MoodleClient,
    token?: string
  ) => Promise<ResourceHandlerResult>;
}

function staticRoute(
  uri: string,
  handler: (params: Record<string, any>, client: MoodleClient, token?: string) => Promise<ResourceHandlerResult>
): ResourceRoute {
  return {
    match: (targetUri: string) => (targetUri === uri ? {} : null),
    handler,
  };
}

function templateRoute(
  regex: RegExp,
  extractParams: (match: RegExpMatchArray) => Record<string, any>,
  handler: (params: Record<string, any>, client: MoodleClient, token?: string) => Promise<ResourceHandlerResult>
): ResourceRoute {
  return {
    match: (targetUri: string) => {
      const match = targetUri.match(regex);
      return match ? extractParams(match) : null;
    },
    handler,
  };
}

/**
 * Declarative Resource Routes table.
 */
export const resourceRoutes: ResourceRoute[] = [
  // 1. Static Route: moodle://site/info
  staticRoute('moodle://site/info', async (_params, client, token) => {
    const rawSiteInfo = await client.callFunction('core_webservice_get_site_info', {}, token);
    const sanitized = semanticPruner.stripSensitiveFields(rawSiteInfo);
    const prunedInfo = {
      sitename: sanitized.sitename,
      username: sanitized.username,
      firstname: sanitized.firstname,
      lastname: sanitized.lastname,
      fullname: sanitized.fullname,
      userid: sanitized.userid,
      siteurl: sanitized.siteurl,
      version: sanitized.version,
      release: sanitized.release,
    };
    return {
      mimeType: 'application/json',
      text: JSON.stringify(prunedInfo, null, 2),
    };
  }),

  // 2. Template Route: moodle://courses/{courseId}/syllabus
  templateRoute(
    /^moodle:\/\/courses\/(\d+)\/syllabus$/,
    (m) => ({ courseId: parseInt(m[1], 10) }),
    async ({ courseId }, client, token) => {
      const contents = await client.callFunction('core_course_get_contents', { courseid: courseId }, token);

      let markdown = `# Course Syllabus (ID: ${courseId})\n\n`;
      if (Array.isArray(contents)) {
        for (const section of contents) {
          markdown += `## ${section.name || 'General'}\n`;
          if (section.summary) {
            markdown += `${semanticPruner.htmlToMarkdown(section.summary)}\n\n`;
          }
          if (Array.isArray(section.modules) && section.modules.length > 0) {
            markdown += `### Activities & Modules:\n`;
            for (const mod of section.modules) {
              markdown += `- **${mod.name}** (${mod.modname || 'module'})\n`;
              if (mod.description) {
                markdown += `  ${semanticPruner.htmlToMarkdown(mod.description).replace(/\n/g, ' ')}\n`;
              }
            }
            markdown += '\n';
          }
        }
      }

      return {
        mimeType: 'text/markdown',
        text: markdown.trim(),
      };
    }
  ),

  // 3. Template Route: moodle://courses/{courseId}/contents
  templateRoute(
    /^moodle:\/\/courses\/(\d+)\/contents$/,
    (m) => ({ courseId: parseInt(m[1], 10) }),
    async ({ courseId }, client, token) => {
      const rawContents = await client.callFunction('core_course_get_contents', { courseid: courseId }, token);
      const sanitized = semanticPruner.stripSensitiveFields(rawContents);
      const pruned = semanticPruner.pruneCourseContents(sanitized);

      return {
        mimeType: 'application/json',
        text: JSON.stringify(pruned, null, 2),
      };
    }
  ),
];

/**
 * Read a resource by URI and return its text content via the declarative router.
 */
export async function readResource(
  uri: string,
  client: MoodleClient,
  token?: string
): Promise<{ uri: string; mimeType: string; text: string }> {
  for (const route of resourceRoutes) {
    const params = route.match(uri);
    if (params !== null) {
      const result = await route.handler(params, client, token);
      return {
        uri,
        mimeType: result.mimeType,
        text: result.text,
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
}
