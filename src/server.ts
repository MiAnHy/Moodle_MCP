import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MoodleClient } from './types/moodle.js';
import { RoleProfile, ToolRegistry, defaultToolRegistry } from './tools/index.js';
import {
  staticResources,
  resourceTemplates,
  readResource,
} from './resources/index.js';

export interface MoodleServerOptions {
  profile?: RoleProfile;
  registry?: ToolRegistry;
  client?: MoodleClient;
  token?: string;
  userId?: number;
  getClient?: () => MoodleClient;
  getToken?: () => string | undefined;
}

/**
 * Factory function creating a fully configured Moodle MCP Server instance.
 */
export function createMoodleServer(options: MoodleServerOptions = {}): Server {
  const profile = options.profile || 'all';
  const registry = options.registry || defaultToolRegistry;

  const clientResolver = (): MoodleClient => {
    if (options.getClient) return options.getClient();
    if (options.client) return options.client;
    throw new Error('MoodleClient not configured for this server instance.');
  };

  const tokenResolver = (): string | undefined => {
    if (options.getToken) return options.getToken();
    return options.token;
  };

  const server = new Server(
    {
      name: 'moodle-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // 1. Tool Listing (precomputed from deep ToolRegistry)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registry.getMcpToolsForProfile(profile),
    };
  });

  // 2. Tool Execution (delegated to deep ToolRegistry)
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
    const { name, arguments: args } = request.params;
    const client = clientResolver();
    const token = tokenResolver();

    return registry.dispatchTool(
      name,
      args,
      {
        client,
        token,
        userId: options.userId,
      },
      profile
    );
  });

  // 3. Resource Listing
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: staticResources.map((res) => ({
        uri: res.uri,
        name: res.name,
        mimeType: res.mimeType,
        description: res.description,
      })),
    };
  });

  // 4. Resource Templates
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: resourceTemplates.map((template) => ({
        uriTemplate: template.uriTemplate,
        name: template.name,
        mimeType: template.mimeType,
        description: template.description,
      })),
    };
  });

  // 5. Read Resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      const client = clientResolver();
      const token = tokenResolver();
      const resource = await readResource(uri, client, token);

      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.text,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to read resource '${uri}': ${error.message}`);
    }
  });

  return server;
}
