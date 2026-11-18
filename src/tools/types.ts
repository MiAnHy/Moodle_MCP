import { z } from 'zod';
import { MoodleClient } from '../types/moodle.js';

export type RoleProfile = 'student' | 'teacher' | 'admin' | 'all';

export interface ToolExecutionContext {
  client: MoodleClient;
  token?: string;
  userId?: number;
}

export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface McpToolDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  profiles: RoleProfile[];
  schema: TParams;
  execute: (params: z.infer<TParams>, context: ToolExecutionContext) => Promise<McpToolResult>;
}
