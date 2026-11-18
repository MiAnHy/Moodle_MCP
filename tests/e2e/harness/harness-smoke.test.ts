import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { FixtureLoader } from './fixture-loader.js';
import { MockMoodleServer } from './mock-moodle-server.js';
import {
  McpTestClient,
  assertSuccess,
  assertError,
  assertTwoPhasePreview,
  assertTwoPhaseCommitted,
  assertUntrustedFenced,
  assertPiiStripped,
  assertTokenReduction,
} from './mcp-test-client.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Helper to make HTTP POST requests against the mock server
async function postRequest(
  url: string,
  params: Record<string, string | number>,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      postData.append(k, String(v));
    }
    const bodyStr = postData.toString();

    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data: any;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode || 200, data, raw });
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

describe('Milestone E1: Test Harness & Infra Verification', () => {
  // -------------------------------------------------------------
  // Suite 1: Fixture Loader
  // -------------------------------------------------------------
  describe('FixtureLoader', () => {
    const expectedFixtures = [
      'calendar-events.json',
      'course-contents.json',
      'enrolled-users.json',
      'forum-discussions.json',
      'login-error.json',
      'login-success.json',
      'moodle-catalog.json',
      'save-grade-success.json',
      'search-users.json',
      'site-info.json',
      'submission-status.json',
      'submissions-batch.json',
      'user-grades.json',
      'users-courses.json',
    ];

    it.each(expectedFixtures)('loads %s without parse errors', (fixtureFile) => {
      const data = FixtureLoader.getFixture(fixtureFile);
      expect(data).toBeDefined();
    });

    it('returns deep clones without polluting cached base fixtures', () => {
      const courses1 = FixtureLoader.getFixture<any[]>('users-courses.json');
      courses1[0].fullname = 'MUTATED FULLNAME';

      const courses2 = FixtureLoader.getFixture<any[]>('users-courses.json');
      expect(courses2[0].fullname).not.toBe('MUTATED FULLNAME');
      expect(courses2[0].fullname).toBe('Introduction to Computer Science');
    });

    it('creates fresh MockMoodleState with mutation methods', () => {
      const state = FixtureLoader.createInitialState();
      expect(state.courses).toBeInstanceOf(Array);
      expect(state.users).toBeInstanceOf(Map);
      expect(state.gradesByStudent).toBeInstanceOf(Map);
      expect(state.validTokens.has('mock-student-token-123')).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // Suite 2: Mock Moodle HTTP Server
  // -------------------------------------------------------------
  describe('MockMoodleServer', () => {
    let server: MockMoodleServer;
    let baseUrl: string;

    beforeAll(async () => {
      server = new MockMoodleServer();
      baseUrl = await server.start(0, '127.0.0.1');
    });

    afterAll(async () => {
      await server.stop();
    });

    beforeEach(() => {
      server.reset();
    });

    it('starts on dynamic ephemeral port and exposes baseUrl', () => {
      expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.getPort()).toBeGreaterThan(0);
    });

    it('handles /login/token.php credential exchange (success and error)', async () => {
      // 1. Success login
      const successRes = await postRequest(`${baseUrl}/login/token.php`, {
        username: 'student',
        password: 'student123',
        service: 'moodle_mobile_app',
      });
      expect(successRes.status).toBe(200);
      expect(successRes.data).toEqual({
        token: 'mock-student-token-123',
        privatetoken: null,
      });

      // 2. Failed login
      const failRes = await postRequest(`${baseUrl}/login/token.php`, {
        username: 'student',
        password: 'wrongpassword',
      });
      expect(failRes.status).toBe(200);
      expect(failRes.data.errorcode).toBe('invalidlogin');

      // 3. Missing parameter
      const missingRes = await postRequest(`${baseUrl}/login/token.php`, {
        username: '',
        password: 'student123',
      });
      expect(missingRes.data.errorcode).toBe('missingparam');
    });

    it('handles /webservice/rest/server.php token validation and function dispatch', async () => {
      const token = 'mock-student-token-123';

      // 1. Invalid token
      const invalidTokenRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: 'bogus-token',
        wsfunction: 'core_webservice_get_site_info',
        moodlewsrestformat: 'json',
      });
      expect(invalidTokenRes.data.errorcode).toBe('invalidtoken');

      // 2. Missing wsfunction
      const missingFnRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: token,
        moodlewsrestformat: 'json',
      });
      expect(missingFnRes.data.errorcode).toBe('missingparam');

      // 3. Query site info
      const siteInfoRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: token,
        wsfunction: 'core_webservice_get_site_info',
        moodlewsrestformat: 'json',
      });
      expect(siteInfoRes.data.sitename).toBeDefined();

      // 4. Query student courses
      const coursesRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: token,
        wsfunction: 'core_enrol_get_users_courses',
        moodlewsrestformat: 'json',
      });
      expect(Array.isArray(coursesRes.data)).toBe(true);
      expect(coursesRes.data.length).toBeGreaterThan(0);
    });

    it('records call history and allows function-based inspection', async () => {
      const token = 'mock-student-token-123';
      await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: token,
        wsfunction: 'core_enrol_get_users_courses',
        userid: 42,
      });

      const calls = server.getRequestsForFunction('core_enrol_get_users_courses');
      expect(calls.length).toBe(1);
      expect(calls[0].wsFunction).toBe('core_enrol_get_users_courses');
      expect(calls[0].wsToken).toBe(token);
      expect(server.getLastRequest()?.wsFunction).toBe('core_enrol_get_users_courses');
    });

    it('performs stateful mutations: mod_assign_save_grade updates gradebook', async () => {
      const teacherToken = 'mock-teacher-token-456';

      // 1. Query initial grade
      const initialGradeRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: teacherToken,
        wsfunction: 'gradereport_user_get_grade_items',
        userid: 42,
      });
      const initialItem = initialGradeRes.data.usergrades[0].gradeitems.find(
        (gi: any) => gi.iteminstance === 10
      );
      expect(initialItem.graderaw).toBe(92.5);

      // 2. Mutate grade (Teacher Two-Phase Phase 2)
      const saveRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: teacherToken,
        wsfunction: 'mod_assign_save_grade',
        assignmentid: 10,
        userid: 42,
        grade: 98.5,
        feedback: 'Superb binary search tree implementation',
      });
      expect(saveRes.data).toBeNull(); // Moodle returns null on success

      // 3. Query updated grade to verify persistent mutation
      const updatedGradeRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: teacherToken,
        wsfunction: 'gradereport_user_get_grade_items',
        userid: 42,
      });
      const updatedItem = updatedGradeRes.data.usergrades[0].gradeitems.find(
        (gi: any) => gi.iteminstance === 10
      );
      expect(updatedItem.graderaw).toBe(98.5);
      expect(updatedItem.gradeformatted).toBe('98.50 %');
      expect(updatedItem.feedback).toContain('Superb binary search tree implementation');
    });

    it('supports function overrides and chaos injection', async () => {
      const token = 'mock-admin-token-789';

      // Custom override
      server.overrideFunction('custom_test_function', (params) => {
        return { custom: true, received: params.testKey };
      });

      const overrideRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: token,
        wsfunction: 'custom_test_function',
        testKey: 'hello-world',
      });
      expect(overrideRes.data).toEqual({ custom: true, received: 'hello-world' });

      // Malformed JSON injection
      server.setMalformedJson('core_webservice_get_site_info');
      const malformedRes = await postRequest(`${baseUrl}/webservice/rest/server.php`, {
        wstoken: token,
        wsfunction: 'core_webservice_get_site_info',
      });
      expect(typeof malformedRes.data).toBe('string');
      expect(malformedRes.data).toContain('{"unclosed_json": true');
    });
  });

  // -------------------------------------------------------------
  // Suite 3: McpTestClient Embedded Domain Assertions
  // -------------------------------------------------------------
  describe('McpTestClient Domain Assertions', () => {
    it('assertSuccess & assertError validate execution status', () => {
      // assertSuccess
      const successResult = {
        isError: false,
        text: '{"result": "ok"}',
        data: { result: 'ok' },
        content: [{ type: 'text', text: '{"result": "ok"}' }],
        raw: {},
      };
      expect(assertSuccess(successResult)).toEqual({ result: 'ok' });

      const failedResult = {
        isError: true,
        text: 'Access control exception: insufficient capabilities',
        content: [{ type: 'text', text: 'Access control exception: insufficient capabilities' }],
        raw: {},
      };
      expect(() => assertSuccess(failedResult)).toThrow('Expected tool call to succeed');

      // assertError
      expect(() => assertError(failedResult, 'Access control exception')).not.toThrow();
      expect(() => assertError(failedResult, /insufficient capabilities/)).not.toThrow();
      expect(() => assertError(failedResult, 'non-existent pattern')).toThrow('Expected error message to contain');
      expect(() => assertError(successResult)).toThrow('Expected tool call to fail');
    });

    it('assertTwoPhasePreview verifies preview diff schema', () => {
      const validPreview = {
        isError: false,
        data: {
          status: 'preview',
          operation: 'submit_grade',
          confirmationRequired: true,
          proposedChanges: { grade: 95.0, studentId: 42 },
        },
        content: [],
        raw: {},
      };

      const preview = assertTwoPhasePreview(validPreview, 'submit_grade');
      expect(preview.status).toBe('preview');
      expect(preview.confirmationRequired).toBe(true);

      const invalidPreview = {
        isError: false,
        data: {
          status: 'committed',
          operation: 'submit_grade',
        },
        content: [],
        raw: {},
      };
      expect(() => assertTwoPhasePreview(invalidPreview)).toThrow('Expected status === "preview"');
    });

    it('assertTwoPhaseCommitted verifies committed mutation schema', () => {
      const validCommitted = {
        isError: false,
        data: {
          status: 'committed',
          operation: 'submit_grade',
          success: true,
          data: { updated: true },
        },
        content: [],
        raw: {},
      };

      const committed = assertTwoPhaseCommitted(validCommitted, 'submit_grade');
      expect(committed.status).toBe('committed');
      expect(committed.success).toBe(true);

      const invalidCommitted = {
        isError: false,
        data: {
          status: 'committed',
          operation: 'submit_grade',
          success: false,
          data: null,
        },
        content: [],
        raw: {},
      };
      expect(() => assertTwoPhaseCommitted(invalidCommitted)).toThrow('Expected success === true');
    });

    it('assertUntrustedFenced enforces prompt injection quarantine', () => {
      const fenced = '<user_content untrusted="true">\nStudent essay content\n</user_content>';
      expect(() => assertUntrustedFenced(fenced)).not.toThrow();

      const unfenced = 'Raw student essay content without quarantine tag';
      expect(() => assertUntrustedFenced(unfenced)).toThrow('Expected content to be enclosed in <user_content untrusted="true">');

      const inverted = '</user_content> content <user_content untrusted="true">';
      expect(() => assertUntrustedFenced(inverted)).toThrow('Malformed fence');
    });

    it('assertPiiStripped flags forbidden password hashes and salts', () => {
      const safeData = {
        id: 42,
        username: 'alice',
        fullname: 'Alice Smith',
        email: 'alice@example.com',
      };
      expect(() => assertPiiStripped(safeData)).not.toThrow();

      const dirtyData = {
        id: 42,
        username: 'alice',
        password: '$2y$10$abcdefghijklmnopqrstuvwxyz0123456789',
        salt: 'internal_secret_salt',
      };
      expect(() => assertPiiStripped(dirtyData)).toThrow('PII violation: found forbidden field "password"');
    });

    it('assertTokenReduction verifies >=80% HTML-to-Markdown compaction', () => {
      const rawHtml = '<div><p style="color: red; font-size: 14px;">' + 'A'.repeat(500) + '</p></div>';
      const compactMd = 'A'.repeat(50); // 90% reduction
      expect(() => assertTokenReduction(rawHtml, compactMd, 0.8)).not.toThrow();

      const bloatedMd = 'A'.repeat(450); // only 10% reduction
      expect(() => assertTokenReduction(rawHtml, bloatedMd, 0.8)).toThrow('Expected token reduction >= 80%');
    });
  });

  // -------------------------------------------------------------
  // Suite 4: McpTestClient InMemory Transport Integration
  // -------------------------------------------------------------
  describe('McpTestClient InMemory Transport Integration', () => {
    let client: McpTestClient;
    let testServer: Server;

    beforeAll(async () => {
      testServer = new Server(
        { name: 'smoke-test-server', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      // Register mock tools
      testServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: 'smoke_test_tool',
            description: 'A mock tool for harness smoke testing',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string' },
              },
            },
          },
        ],
      }));

      testServer.setRequestHandler(CallToolRequestSchema, async (req) => {
        if (req.params.name === 'smoke_test_tool') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'ok',
                  receivedMessage: req.params.arguments?.message,
                }),
              },
            ],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        };
      });

      client = await McpTestClient.createInMemory({
        server: testServer,
      });
    });

    afterAll(async () => {
      await client.close();
      await testServer.close();
    });

    it('discovers registered tools and checks availability', async () => {
      const tools = await client.listTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('smoke_test_tool');

      expect(await client.hasTool('smoke_test_tool')).toBe(true);
      expect(await client.hasTool('non_existent_tool')).toBe(false);
    });

    it('invokes tool via callTool, auto-parses JSON, and executes successfully', async () => {
      const res = await client.callTool('smoke_test_tool', { message: 'Hello MCP Harness' });
      expect(res.isError).toBe(false);
      expect(res.data).toEqual({
        status: 'ok',
        receivedMessage: 'Hello MCP Harness',
      });
      expect(client.assertSuccess(res)).toEqual({
        status: 'ok',
        receivedMessage: 'Hello MCP Harness',
      });
    });

    it('handles non-existent tool with error response containment', async () => {
      const res = await client.callTool('unknown_tool', {});
      expect(res.isError).toBe(true);
      expect(() => client.assertError(res, 'Unknown tool')).not.toThrow();
    });
  });
});
