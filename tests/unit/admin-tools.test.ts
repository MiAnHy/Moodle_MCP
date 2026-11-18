import { describe, it, expect, beforeEach } from 'vitest';
import { MockMoodleClient } from '../mocks/mock-moodle-client.js';
import { getSiteInfoTool } from '../../src/tools/admin/site-info.js';
import { searchUsersTool } from '../../src/tools/admin/search-users.js';
import { createUserTool } from '../../src/tools/admin/create-user.js';
import { createCourseTool } from '../../src/tools/admin/create-course.js';
import { enrolUserTool } from '../../src/tools/admin/enrol-user.js';

describe('Admin Profile Tools & Governance (Ticket 05)', () => {
  let mockClient: MockMoodleClient;

  beforeEach(() => {
    mockClient = new MockMoodleClient();
    mockClient.loadDefaultFixtures();
    mockClient.setResponses({
      core_user_create_users: [{ id: 99, username: 'newstudent' }],
      core_course_create_courses: [{ id: 202, shortname: 'CS102' }],
      enrol_manual_enrol_users: null,
    });
  });

  it('moodle_get_site_info returns site version, capabilities, and administrator identity', async () => {
    const result = await getSiteInfoTool.execute({}, { client: mockClient });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.sitename).toBeDefined();
    expect(parsed.release).toBeDefined();
    expect(parsed.version).toBeDefined();
    expect(parsed.username).toBe('admin');
  });

  it('moodle_search_users strips password hashes and returns matching user accounts', async () => {
    const result = await searchUsersTool.execute({ key: 'email', value: 'student1' }, { client: mockClient });
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].username).toBe('student1');
    expect(parsed[0]).not.toHaveProperty('password');
    expect(parsed[0]).not.toHaveProperty('salt');
  });

  it('moodle_create_user enforces Two-Phase Mutation: preview when unconfirmed', async () => {
    const result = await createUserTool.execute(
      {
        username: 'newstudent',
        email: 'newstudent@university.edu',
        firstname: 'New',
        lastname: 'Student',
        dry_run: true,
        confirm: false,
      },
      { client: mockClient }
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.preview).toBe(true);
    expect(parsed.status).toBe('PENDING_HUMAN_CONFIRMATION');
    expect(mockClient.getCallsForFunction('core_user_create_users')).toHaveLength(0);
  });

  it('moodle_create_user provisions user in Moodle when dry_run=false and confirm=true', async () => {
    const result = await createUserTool.execute(
      {
        username: 'newstudent',
        email: 'newstudent@university.edu',
        firstname: 'New',
        lastname: 'Student',
        dry_run: false,
        confirm: true,
      },
      { client: mockClient }
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.username).toBe('newstudent');
    expect(mockClient.getCallsForFunction('core_user_create_users')).toHaveLength(1);
  });

  it('moodle_create_course enforces dry-run preview and commits upon confirmation', async () => {
    const previewResult = await createCourseTool.execute(
      {
        fullname: 'Data Structures and Algorithms',
        shortname: 'CS102',
        dry_run: true,
        confirm: false,
      },
      { client: mockClient }
    );
    const parsedPreview = JSON.parse(previewResult.content[0].text);
    expect(parsedPreview.preview).toBe(true);

    const commitResult = await createCourseTool.execute(
      {
        fullname: 'Data Structures and Algorithms',
        shortname: 'CS102',
        dry_run: false,
        confirm: true,
      },
      { client: mockClient }
    );
    const parsedCommit = JSON.parse(commitResult.content[0].text);
    expect(parsedCommit.success).toBe(true);
    expect(parsedCommit.shortname).toBe('CS102');
  });

  it('moodle_enrol_user enforces dry-run preview and enrols student upon confirmation', async () => {
    const preview = await enrolUserTool.execute(
      { courseid: 101, userid: 42, roleid: 5, dry_run: true, confirm: false },
      { client: mockClient }
    );
    expect(JSON.parse(preview.content[0].text).preview).toBe(true);

    const commit = await enrolUserTool.execute(
      { courseid: 101, userid: 42, roleid: 5, dry_run: false, confirm: true },
      { client: mockClient }
    );
    expect(JSON.parse(commit.content[0].text).success).toBe(true);
    expect(mockClient.getCallsForFunction('enrol_manual_enrol_users')).toHaveLength(1);
  });
});
