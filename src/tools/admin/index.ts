import { getSiteInfoTool } from './site-info.js';
import { searchUsersTool } from './search-users.js';
import { createUserTool } from './create-user.js';
import { createCourseTool } from './create-course.js';
import { enrolUserTool } from './enrol-user.js';

export const adminTools = [
  getSiteInfoTool,
  searchUsersTool,
  createUserTool,
  createCourseTool,
  enrolUserTool,
];
