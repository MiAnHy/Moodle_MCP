import { describe, it, expect, vi } from 'vitest';
import { executeMutatingTool } from '../../src/tools/mutation-guard.js';

describe('Two-Phase Mutation Guard Module', () => {
  it('returns standardized preview diff when dry_run is true (default)', async () => {
    const writeFn = vi.fn().mockResolvedValue({ id: 100 });

    const result = await executeMutatingTool(
      { dry_run: true, confirm: false },
      () => ({
        action: 'test_action',
        fieldA: 'valueA',
      }),
      writeFn
    );

    expect(writeFn).not.toHaveBeenCalled();
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.preview).toBe(true);
    expect(parsed.action).toBe('test_action');
    expect(parsed.fieldA).toBe('valueA');
    expect(parsed.status).toBe('PENDING_HUMAN_CONFIRMATION');
    expect(parsed.message).toContain('DRY RUN PREVIEW');
  });

  it('returns standardized preview diff when confirm is false even if dry_run is false', async () => {
    const writeFn = vi.fn().mockResolvedValue({ id: 100 });

    const result = await executeMutatingTool(
      { dry_run: false, confirm: false },
      () => ({
        action: 'test_action',
      }),
      writeFn
    );

    expect(writeFn).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.preview).toBe(true);
    expect(parsed.status).toBe('PENDING_HUMAN_CONFIRMATION');
  });

  it('executes write and returns committed result when dry_run is false and confirm is true', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, id: 42 });

    const result = await executeMutatingTool(
      { dry_run: false, confirm: true },
      () => ({ action: 'test_action' }),
      writeFn
    );

    expect(writeFn).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe(42);
    expect(parsed.preview).toBeUndefined();
  });
});
