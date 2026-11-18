import { searchFunctionsTool } from './search-functions.js';
import { describeFunctionTool } from './describe-function.js';
import { executeFunctionTool } from './execute-function.js';
import { FunctionCatalogService } from './catalog.js';

export { FunctionCatalogService };

export const discoveryTools = [
  searchFunctionsTool,
  describeFunctionTool,
  executeFunctionTool,
];
