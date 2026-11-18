import http from 'node:http';
import { URL } from 'node:url';
import querystring from 'node:querystring';
import { FixtureLoader, MockMoodleState } from './fixture-loader.js';

export interface RecordedRequest {
  timestamp: number;
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  query: Record<string, string>;
  body: Record<string, any>;
  rawBody: string;
  wsFunction?: string;
  wsToken?: string;
}

export type FunctionOverrideHandler = (
  params: Record<string, any>,
  req: http.IncomingMessage,
  res: http.ServerResponse
) => any | Promise<any>;

export interface MockServerOptions {
  port?: number;
  host?: string;
}

export class MockMoodleServer {
  private server: http.Server | null = null;
  private baseUrl: string = '';
  private port: number = 0;
  private state: MockMoodleState;
  private recordedRequests: RecordedRequest[] = [];
  private functionOverrides: Map<string, FunctionOverrideHandler> = new Map();

  // Chaos injection settings for Tier 2 boundary testing
  private latencyMs: number = 0;
  private shouldDestroySocket: boolean = false;
  private httpErrorStatus: number | null = null;
  private malformedJsonFunctions: Set<string> = new Set();
  private oversizedPayloadFunctions: Map<string, number> = new Map();

  constructor() {
    this.state = FixtureLoader.createInitialState();
  }

  public async start(port = 0, host = '127.0.0.1'): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res).catch((err) => {
          if (!res.writableEnded) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Mock Server Error', message: err.message }));
          }
        });
      });

      this.server.listen(port, host, () => {
        const addr = this.server!.address();
        if (typeof addr === 'object' && addr !== null) {
          this.port = addr.port;
          this.baseUrl = `http://${addr.address}:${addr.port}`;
          resolve(this.baseUrl);
        } else {
          reject(new Error('Failed to obtain server address'));
        }
      });

      this.server.on('error', reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getPort(): number {
    return this.port;
  }

  public getState(): MockMoodleState {
    return this.state;
  }

  public reset(): void {
    this.state = FixtureLoader.createInitialState();
    this.recordedRequests = [];
    this.functionOverrides.clear();
    this.latencyMs = 0;
    this.shouldDestroySocket = false;
    this.httpErrorStatus = null;
    this.malformedJsonFunctions.clear();
    this.oversizedPayloadFunctions.clear();
  }

  // --- Chaos Injection API for Tier 2 Boundary Tests ---
  public setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  public setDropConnection(enabled: boolean): void {
    this.shouldDestroySocket = enabled;
  }

  public setHttpError(status: number): void {
    this.httpErrorStatus = status;
  }

  public setMalformedJson(wsFunction: string): void {
    this.malformedJsonFunctions.add(wsFunction);
  }

  public clearMalformedJson(wsFunction?: string): void {
    if (wsFunction) {
      this.malformedJsonFunctions.delete(wsFunction);
    } else {
      this.malformedJsonFunctions.clear();
    }
  }

  public setOversizedPayload(wsFunction: string, sizeBytes: number): void {
    this.oversizedPayloadFunctions.set(wsFunction, sizeBytes);
  }

  public clearOversizedPayload(wsFunction?: string): void {
    if (wsFunction) {
      this.oversizedPayloadFunctions.delete(wsFunction);
    } else {
      this.oversizedPayloadFunctions.clear();
    }
  }

  public overrideFunction(wsFunction: string, handler: FunctionOverrideHandler): void {
    this.functionOverrides.set(wsFunction, handler);
  }

  public clearOverride(wsFunction: string): void {
    this.functionOverrides.delete(wsFunction);
  }

  // --- Request Inspection API ---
  public getRequests(): RecordedRequest[] {
    return [...this.recordedRequests];
  }

  public getRequestsForFunction(wsFunction: string): RecordedRequest[] {
    return this.recordedRequests.filter((r) => r.wsFunction === wsFunction);
  }

  public getLastRequest(): RecordedRequest | undefined {
    return this.recordedRequests[this.recordedRequests.length - 1];
  }

  public clearHistory(): void {
    this.recordedRequests = [];
  }

  // --- Core Request Dispatcher ---
  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (this.shouldDestroySocket) {
      req.socket.destroy();
      return;
    }

    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }

    if (this.httpErrorStatus !== null) {
      res.writeHead(this.httpErrorStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Simulated HTTP Error ${this.httpErrorStatus}` }));
      return;
    }

    // Read full request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const parsedUrl = new URL(req.url || '/', this.baseUrl || 'http://127.0.0.1');

    let bodyData: Record<string, any> = {};
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      bodyData = querystring.parse(rawBody);
    } else if (contentType.includes('application/json')) {
      try {
        bodyData = JSON.parse(rawBody);
      } catch {
        bodyData = {};
      }
    }

    const queryData: Record<string, string> = {};
    parsedUrl.searchParams.forEach((val, key) => {
      queryData[key] = val;
    });

    const combinedParams = { ...queryData, ...bodyData };
    const wsFunction = (combinedParams.wsfunction || combinedParams.wsFunction) as string | undefined;
    const wsToken = (combinedParams.wstoken || combinedParams.token || combinedParams.wsToken) as string | undefined;

    this.recordedRequests.push({
      timestamp: Date.now(),
      method: req.method || 'GET',
      path: parsedUrl.pathname,
      headers: req.headers,
      query: queryData,
      body: bodyData,
      rawBody,
      wsFunction,
      wsToken,
    });

    // Route: /login/token.php
    if (parsedUrl.pathname.includes('/login/token.php')) {
      this.handleTokenLogin(combinedParams, res);
      return;
    }

    // Route: /webservice/rest/server.php
    if (parsedUrl.pathname.includes('/webservice/rest/server.php')) {
      await this.handleWebService(wsFunction, wsToken, combinedParams, req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint Not Found', path: parsedUrl.pathname }));
  }

  private handleTokenLogin(params: Record<string, any>, res: http.ServerResponse): void {
    const { username, password } = params;

    if (!username) {
      this.sendJson(res, 200, {
        error: 'A required parameter (username) was missing',
        errorcode: 'missingparam',
      });
      return;
    }
    if (!password) {
      this.sendJson(res, 200, {
        error: 'A required parameter (password) was missing',
        errorcode: 'missingparam',
      });
      return;
    }

    // Check known test credentials
    if (username === 'student' && password === 'student123') {
      this.sendJson(res, 200, { token: 'mock-student-token-123', privatetoken: null });
    } else if (username === 'teacher' && password === 'teacher123') {
      this.sendJson(res, 200, { token: 'mock-teacher-token-456', privatetoken: null });
    } else if (username === 'admin' && password === 'admin123') {
      this.sendJson(res, 200, { token: 'mock-admin-token-789', privatetoken: null });
    } else if (
      this.state.authUsers.has(username) &&
      this.state.authUsers.get(username)!.password === password
    ) {
      const user = this.state.authUsers.get(username)!;
      this.sendJson(res, 200, { token: user.token, privatetoken: null });
    } else {
      // Moodle standard login failure (HTTP 200 with JSON error)
      this.sendJson(res, 200, {
        error: 'Invalid login, please try again',
        errorcode: 'invalidlogin',
        stacktrace: null,
        debuginfo: null,
        reproductionlink: null,
      });
    }
  }

  private async handleWebService(
    wsFunction: string | undefined,
    wsToken: string | undefined,
    params: Record<string, any>,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 1. Validate Token
    const validTokens = new Set([
      'mock-student-token-123',
      'mock-teacher-token-456',
      'mock-admin-token-789',
      '4a82b9c7e1d5f3a0b2c4e6f8a1d3e5b7',
      'mock-moodle-token-1234567890abcdef',
      ...this.state.validTokens,
    ]);

    if (!wsToken || !validTokens.has(wsToken)) {
      this.sendJson(res, 200, {
        exception: 'moodle_exception',
        errorcode: 'invalidtoken',
        message: 'Invalid token - token not found',
      });
      return;
    }

    // 2. Validate Function Presence
    if (!wsFunction) {
      this.sendJson(res, 200, {
        exception: 'moodle_exception',
        errorcode: 'missingparam',
        message: 'A required parameter (wsfunction) was missing',
      });
      return;
    }

    // 3. Check Chaos Injections (malformed JSON, oversized payload)
    if (this.malformedJsonFunctions.has(wsFunction)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"unclosed_json": true, "corrupted');
      return;
    }

    if (this.oversizedPayloadFunctions.has(wsFunction)) {
      const targetSize = this.oversizedPayloadFunctions.get(wsFunction)!;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"data":"');
      const chunkSize = 64 * 1024;
      const dummy = 'A'.repeat(chunkSize);
      let sent = 0;
      while (sent < targetSize) {
        res.write(dummy);
        sent += chunkSize;
      }
      res.end('"}');
      return;
    }

    // 4. Check Test Overrides
    if (this.functionOverrides.has(wsFunction)) {
      const overrideResult = await this.functionOverrides.get(wsFunction)!(params, req, res);
      if (!res.writableEnded) {
        this.sendJson(res, 200, overrideResult);
      }
      return;
    }

    // 5. Stateful Function Dispatch
    switch (wsFunction) {
      case 'core_webservice_get_site_info':
        this.sendJson(res, 200, this.state.siteInfo);
        break;

      case 'core_enrol_get_users_courses':
        this.sendJson(res, 200, this.state.courses);
        break;

      case 'core_course_get_contents':
        this.sendJson(res, 200, this.state.courseContents);
        break;

      case 'core_calendar_get_calendar_upcoming_view':
      case 'core_calendar_get_action_events_by_timesort':
      case 'core_calendar_get_action_events_by_course':
        this.sendJson(res, 200, this.state.calendarEvents);
        break;

      case 'gradereport_user_get_grade_items': {
        const studentId = Number(params.userid || params.user_id || 42);
        const grades = this.state.gradesByStudent.get(studentId) || this.state.defaultGrades;
        this.sendJson(res, 200, grades);
        break;
      }

      case 'mod_assign_get_submission_status': {
        const assignId = Number(params.assignid || params.assignmentid || 10);
        const sub = this.state.submissionStatuses.get(assignId) || this.state.defaultSubmissionStatus;
        this.sendJson(res, 200, sub);
        break;
      }

      case 'mod_assign_get_submissions':
        this.sendJson(res, 200, this.state.batchSubmissions);
        break;

      // MUTATION: Save Grade (Teacher Two-Phase Confirm)
      case 'mod_assign_save_grade': {
        const assignmentId = Number(params.assignmentid || params.assignment_id || 10);
        const userId = Number(params.userid || params.user_id || 42);
        const grade = parseFloat(params.grade || '0');
        const feedback =
          params['plugindata[assignfeedbackcomments_editor][text]'] ||
          params.plugindata?.assignfeedbackcomments_editor?.text ||
          params.feedback ||
          '';

        this.state.applyGradeMutation(assignmentId, userId, grade, feedback);
        this.sendJson(res, 200, null);
        break;
      }

      case 'core_enrol_get_enrolled_users':
        this.sendJson(res, 200, this.state.enrolledUsers);
        break;

      case 'core_user_get_users':
        this.sendJson(res, 200, { users: Array.from(this.state.users.values()), warnings: [] });
        break;

      // MUTATION: Create User (Admin Two-Phase Confirm)
      case 'core_user_create_users': {
        const createdUsers = this.state.applyCreateUsersMutation(params);
        this.sendJson(res, 200, createdUsers);
        break;
      }

      // MUTATION: Create Course (Admin Two-Phase Confirm)
      case 'core_course_create_courses': {
        const createdCourses = this.state.applyCreateCoursesMutation(params);
        this.sendJson(res, 200, createdCourses);
        break;
      }

      // MUTATION: Enrol User (Admin Two-Phase Confirm)
      case 'enrol_manual_enrol_users': {
        this.state.applyEnrolUserMutation(params);
        this.sendJson(res, 200, null);
        break;
      }

      case 'mod_forum_get_forum_discussions':
        this.sendJson(res, 200, this.state.forumDiscussions);
        break;

      // MUTATION: Post Announcement
      case 'mod_forum_add_discussion': {
        const discussion = this.state.applyAddDiscussionMutation(params);
        this.sendJson(res, 200, discussion);
        break;
      }

      default:
        // Fallback response
        this.sendJson(res, 200, {
          warning: `Mock response for unhandled function ${wsFunction}`,
          function: wsFunction,
          params,
        });
        break;
    }
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Mock-Moodle': 'true',
    });
    res.end(JSON.stringify(data));
  }
}
