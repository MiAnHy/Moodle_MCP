import { studentTools } from './student/index.js';
import { teacherTools } from './teacher/index.js';
import { adminTools } from './admin/index.js';
import { discoveryTools } from './discovery/index.js';
import { McpToolDefinition, RoleProfile } from './types.js';
import { ToolRegistry } from './registry.js';

export * from './types.js';
export * from './mutation-guard.js';
export * from './registry.js';
export { studentTools } from './student/index.js';
export { teacherTools } from './teacher/index.js';
export { adminTools } from './admin/index.js';
export { discoveryTools } from './discovery/index.js';

export const allTools: McpToolDefinition[] = [
  ...studentTools,
  ...teacherTools,
  ...adminTools,
  ...discoveryTools,
];

export const defaultToolRegistry = new ToolRegistry(allTools);

/**
 * Filter tools by active RoleProfile.
 */
export function getToolsForProfile(profile: RoleProfile = 'all'): McpToolDefinition[] {
  return defaultToolRegistry.getToolsForProfile(profile);
}
