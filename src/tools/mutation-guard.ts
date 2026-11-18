import { McpToolResult } from './types.js';

export interface MutationPreview {
  action: string;
  [key: string]: unknown;
}

export interface MutationParams {
  dry_run?: boolean;
  confirm?: boolean;
}

/**
 * Higher-order guard for state-altering MCP tools.
 * Enforces Two-Phase Mutation (ADR-0004):
 * - If dry_run is true (default) or confirm is false, executes buildPreview()
 *   and returns a standardized preview response with status 'PENDING_HUMAN_CONFIRMATION'.
 * - Only when dry_run is false AND confirm is true, executes executeWrite().
 */
export async function executeMutatingTool<T>(
  params: MutationParams,
  buildPreview: () => MutationPreview | Promise<MutationPreview>,
  executeWrite: () => Promise<T>
): Promise<McpToolResult> {
  if (params.dry_run || !params.confirm) {
    const previewData = await buildPreview();
    const { action, ...rest } = previewData;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              preview: true,
              action,
              ...rest,
              status: 'PENDING_HUMAN_CONFIRMATION',
              message:
                'DRY RUN PREVIEW: To commit this change to Moodle, ask the user for confirmation and re-invoke with dry_run: false, confirm: true.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const result = await executeWrite();
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
}
