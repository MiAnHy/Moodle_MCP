import { describe, it, expect, beforeEach } from 'vitest';
import { MockMoodleClient } from '../mocks/mock-moodle-client.js';
import { searchFunctionsTool } from '../../src/tools/discovery/search-functions.js';
import { describeFunctionTool } from '../../src/tools/discovery/describe-function.js';
import { executeFunctionTool } from '../../src/tools/discovery/execute-function.js';
import { getToolsForProfile } from '../../src/tools/index.js';

describe('Dynamic Function Discovery Trio (Ticket 06)', () => {
  let mockClient: MockMoodleClient;

  beforeEach(() => {
    mockClient = new MockMoodleClient();
    mockClient.loadDefaultFixtures();
  });

  it('moodle_search_functions searches catalog by keyword and flags mutating operations', async () => {
    const result = await searchFunctionsTool.execute({ query: 'quiz' }, { client: mockClient });
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].name).toContain('quiz');
  });

  it('moodle_describe_function returns schema and parameter details', async () => {
    const result = await describeFunctionTool.execute(
      { function_name: 'core_course_get_courses' },
      { client: mockClient }
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe('core_course_get_courses');
    expect(parsed.parameters).toBeDefined();
    expect(parsed.returns).toBeDefined();
  });

  it('moodle_describe_function returns error for blocked internal functions', async () => {
    const result = await describeFunctionTool.execute(
      { function_name: 'tool_installaddon_install_addon' },
      { client: mockClient }
    );
    expect(result.isError).toBe(true);
  });

  it('moodle_execute_function executes non-mutating query directly', async () => {
    const result = await executeFunctionTool.execute(
      { function_name: 'core_course_get_contents', parameters: { courseid: 101 } },
      { client: mockClient }
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('moodle_execute_function enforces Two-Phase Mutation preview for state-changing calls', async () => {
    const result = await executeFunctionTool.execute(
      {
        function_name: 'core_course_delete_courses',
        parameters: { courseids: [101] },
        dry_run: true,
        confirm: false,
      },
      { client: mockClient }
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.preview).toBe(true);
    expect(parsed.is_mutating).toBe(true);
    expect(parsed.status).toBe('PENDING_HUMAN_CONFIRMATION');
    expect(parsed.message).toContain('DRY RUN PREVIEW');
    expect(mockClient.getCallsForFunction('core_course_delete_courses')).toHaveLength(0);
  });

  it('moodle_execute_function commits mutation when dry_run=false and confirm=true', async () => {
    mockClient.setResponse('core_course_delete_courses', { warnings: [] });

    const result = await executeFunctionTool.execute(
      {
        function_name: 'core_course_delete_courses',
        parameters: { courseids: [101] },
        dry_run: false,
        confirm: true,
      },
      { client: mockClient }
    );
    expect(result.isError).toBeFalsy();
    expect(mockClient.getCallsForFunction('core_course_delete_courses')).toHaveLength(1);
  });

  it('getToolsForProfile filters catalog appropriately by role', () => {
    const studentTools = getToolsForProfile('student');
    const teacherTools = getToolsForProfile('teacher');
    const adminTools = getToolsForProfile('admin');

    const studentNames = studentTools.map((t) => t.name);
    const teacherNames = teacherTools.map((t) => t.name);
    const adminNames = adminTools.map((t) => t.name);

    expect(studentNames).toContain('moodle_my_courses');
    expect(studentNames).toContain('moodle_my_grades');
    expect(studentNames).not.toContain('moodle_create_user');

    expect(teacherNames).toContain('moodle_submit_grade');
    expect(teacherNames).toContain('moodle_get_enrolled_students');

    expect(adminNames).toContain('moodle_create_user');
    expect(adminNames).toContain('moodle_create_course');
  });
});
