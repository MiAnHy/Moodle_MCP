import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MockMoodleClient } from '../mocks/mock-moodle-client.js';
import { createMoodleServer } from '../../src/server.js';

describe('Universal MCP Server Runtime (Ticket 07)', () => {
  let mockClient: MockMoodleClient;

  beforeEach(() => {
    mockClient = new MockMoodleClient();
    mockClient.loadDefaultFixtures();
  });

  describe('Student Profile Server', () => {
    let client: Client;
    let server: any;

    beforeEach(async () => {
      server = createMoodleServer({
        profile: 'student',
        client: mockClient,
        token: 'mock-student-token',
        userId: 42,
      });

      client = new Client({ name: 'test-student-client', version: '1.0.0' }, { capabilities: {} });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    });

    afterEach(async () => {
      await client.close();
      await server.close();
    });

    it('lists only student tools and dynamic discovery trio (< 20 tools)', async () => {
      const response = await client.listTools();
      const toolNames = response.tools.map((t) => t.name);

      expect(toolNames).toContain('moodle_my_courses');
      expect(toolNames).toContain('moodle_my_deadlines');
      expect(toolNames).toContain('moodle_my_grades');
      expect(toolNames).toContain('moodle_my_submissions');
      expect(toolNames).toContain('moodle_get_course_content');
      expect(toolNames).toContain('moodle_course_announcements');
      expect(toolNames).toContain('moodle_search_functions');
      expect(toolNames).toContain('moodle_describe_function');

      // Admin, Teacher, and arbitrary execution tools must NOT be present for student profile
      expect(toolNames).not.toContain('moodle_execute_function');
      expect(toolNames).not.toContain('moodle_create_user');
      expect(toolNames).not.toContain('moodle_create_course');
      expect(toolNames).not.toContain('moodle_enrol_user');
      expect(toolNames).not.toContain('moodle_submit_grade');

      // Total tools should preserve model context (< 20 tools)
      expect(response.tools.length).toBeLessThanOrEqual(15);
    });

    it('executes moodle_my_courses successfully via MCP protocol', async () => {
      const result: any = await client.callTool({
        name: 'moodle_my_courses',
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const courses = JSON.parse(result.content[0].text);
      expect(Array.isArray(courses)).toBe(true);
      expect(courses[0].shortname).toBe('CS101');
    });

    it('rejects execution of an admin tool not active for student profile', async () => {
      const result: any = await client.callTool({
        name: 'moodle_create_user',
        arguments: { username: 'evil', email: 'evil@example.com' },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Tool 'moodle_create_user' is not found or not active");
    });
  });

  describe('Teacher Profile Server & Two-Phase Guardrails', () => {
    let client: Client;
    let server: any;

    beforeEach(async () => {
      server = createMoodleServer({
        profile: 'teacher',
        client: mockClient,
        token: 'mock-teacher-token',
        userId: 10,
      });

      client = new Client({ name: 'test-teacher-client', version: '1.0.0' }, { capabilities: {} });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    });

    afterEach(async () => {
      await client.close();
      await server.close();
    });

    it('lists teacher tools and safeguards', async () => {
      const response = await client.listTools();
      const toolNames = response.tools.map((t) => t.name);

      expect(toolNames).toContain('moodle_list_teacher_courses');
      expect(toolNames).toContain('moodle_get_enrolled_students');
      expect(toolNames).toContain('moodle_get_assignment_submissions');
      expect(toolNames).toContain('moodle_submit_grade');
      expect(toolNames).toContain('moodle_post_announcement');
      expect(toolNames).not.toContain('moodle_create_user');
    });

    it('executes submit_grade in dry-run mode returning preview diff', async () => {
      const result: any = await client.callTool({
        name: 'moodle_submit_grade',
        arguments: {
          assignmentid: 10,
          userid: 42,
          grade: 92,
          feedback: 'Excellent work!',
          dry_run: true,
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.preview).toBe(true);
      expect(parsed.proposed_grade).toBe(92);
      expect(parsed.status).toBe('PENDING_HUMAN_CONFIRMATION');
    });
  });

  describe('MCP Resources Provider', () => {
    let client: Client;
    let server: any;

    beforeEach(async () => {
      server = createMoodleServer({
        profile: 'all',
        client: mockClient,
        token: 'mock-token',
        userId: 1,
      });

      client = new Client({ name: 'test-resource-client', version: '1.0.0' }, { capabilities: {} });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    });

    afterEach(async () => {
      await client.close();
      await server.close();
    });

    it('lists static resources and resource templates', async () => {
      const resourcesRes = await client.listResources();
      expect(resourcesRes.resources).toHaveLength(1);
      expect(resourcesRes.resources[0].uri).toBe('moodle://site/info');

      const templatesRes = await client.listResourceTemplates();
      expect(templatesRes.resourceTemplates.length).toBeGreaterThanOrEqual(2);
      const uriTemplates = templatesRes.resourceTemplates.map((t) => t.uriTemplate);
      expect(uriTemplates).toContain('moodle://courses/{courseId}/syllabus');
      expect(uriTemplates).toContain('moodle://courses/{courseId}/contents');
    });

    it('reads moodle://site/info static resource', async () => {
      const res = await client.readResource({ uri: 'moodle://site/info' });
      expect(res.contents).toHaveLength(1);
      const content = res.contents[0] as any;
      expect(content.uri).toBe('moodle://site/info');
      expect(content.mimeType).toBe('application/json');
      const parsed = JSON.parse(content.text);
      expect(parsed.sitename).toBe('Enterprise Moodle LMS');
    });

    it('reads moodle://courses/{courseId}/syllabus markdown resource', async () => {
      const res = await client.readResource({ uri: 'moodle://courses/101/syllabus' });
      expect(res.contents).toHaveLength(1);
      const content = res.contents[0] as any;
      expect(content.mimeType).toBe('text/markdown');
      expect(content.text).toContain('# Course Syllabus');
      expect(content.text).toContain('Course Overview & Syllabus');
    });

    it('reads moodle://courses/{courseId}/contents json resource', async () => {
      const res = await client.readResource({ uri: 'moodle://courses/101/contents' });
      expect(res.contents).toHaveLength(1);
      const content = res.contents[0] as any;
      expect(content.mimeType).toBe('application/json');
      const parsed = JSON.parse(content.text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe('Course Overview & Syllabus');
    });
  });
});
