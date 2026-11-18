import type { MoodleClient } from '../../src/moodle/client.js';
import { FixtureLoader } from '../e2e/harness/fixture-loader.js';

export interface RecordedCall {
  functionName: string;
  parameters?: Record<string, any>;
  token?: string;
  timestamp: number;
}

export interface RecordedLoginCall {
  username: string;
  password?: string;
  service?: string;
  timestamp: number;
}

export class MockMoodleClient implements MoodleClient {
  public calls: RecordedCall[] = [];
  public loginCalls: RecordedLoginCall[] = [];
  private responses: Map<string, any> = new Map();
  private errors: Map<string, Error> = new Map();
  private loginResponse: { token: string; privatetoken?: string } = {
    token: "mock-moodle-token-1234567890abcdef",
    privatetoken: "mock-private-token-fedcba0987654321"
  };
  private loginError: Error | null = null;

  setResponse<T>(functionName: string, response: T): this {
    this.responses.set(functionName, response);
    this.errors.delete(functionName);
    return this;
  }

  setResponses(responses: Record<string, any>): this {
    for (const [fn, resp] of Object.entries(responses)) {
      this.setResponse(fn, resp);
    }
    return this;
  }

  setError(functionName: string, error: Error): this {
    this.errors.set(functionName, error);
    this.responses.delete(functionName);
    return this;
  }

  setLoginResponse(response: { token: string; privatetoken?: string }): this {
    this.loginResponse = response;
    this.loginError = null;
    return this;
  }

  setLoginError(error: Error): this {
    this.loginError = error;
    return this;
  }

  getLastCall(): RecordedCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  getCallsForFunction(functionName: string): RecordedCall[] {
    return this.calls.filter(c => c.functionName === functionName);
  }

  clearHistory(): void {
    this.calls = [];
    this.loginCalls = [];
  }

  loadDefaultFixtures(): this {
    this.setResponses({
      core_webservice_get_site_info: FixtureLoader.getFixture('site-info.json'),
      core_enrol_get_users_courses: FixtureLoader.getFixture('users-courses.json'),
      core_course_get_contents: FixtureLoader.getFixture('course-contents.json'),
      core_calendar_get_calendar_upcoming_view: FixtureLoader.getFixture('calendar-events.json'),
      core_calendar_get_action_events_by_timesort: FixtureLoader.getFixture('calendar-events.json'),
      core_calendar_get_action_events_by_course: FixtureLoader.getFixture('calendar-events.json'),
      gradereport_user_get_grade_items: FixtureLoader.getFixture('user-grades.json'),
      mod_assign_get_submission_status: FixtureLoader.getFixture('submission-status.json'),
      mod_assign_get_submissions: FixtureLoader.getFixture('submissions-batch.json'),
      mod_assign_save_grade: null,
      core_enrol_get_enrolled_users: FixtureLoader.getFixture('enrolled-users.json'),
      core_user_get_users: FixtureLoader.getFixture('search-users.json'),
      mod_forum_get_forum_discussions: FixtureLoader.getFixture('forum-discussions.json'),
      mod_forum_add_discussion_post: { postid: 101 },
    });
    return this;
  }

  reset(): void {
    this.clearHistory();
    this.responses.clear();
    this.errors.clear();
    this.loginError = null;
    this.loginResponse = {
      token: "mock-moodle-token-1234567890abcdef",
      privatetoken: "mock-private-token-fedcba0987654321"
    };
  }

  async login(username: string, password: string, service?: string): Promise<{ token: string; privatetoken?: string }> {
    this.loginCalls.push({ username, password, service, timestamp: Date.now() });
    if (this.loginError) {
      throw this.loginError;
    }
    return this.loginResponse;
  }

  async callFunction<T = any>(functionName: string, parameters?: Record<string, any>, token?: string): Promise<T> {
    this.calls.push({ functionName, parameters, token, timestamp: Date.now() });
    if (this.errors.has(functionName)) {
      throw this.errors.get(functionName)!;
    }
    if (this.responses.has(functionName)) {
      return this.responses.get(functionName) as T;
    }
    throw new Error(`MockMoodleClient: No mock response or error configured for function '${functionName}'`);
  }
}
