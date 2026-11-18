import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MockMoodleState {
  siteInfo: any;
  courses: any[];
  courseContents: any[];
  calendarEvents: any;
  defaultGrades: any;
  gradesByStudent: Map<number, any>;
  defaultSubmissionStatus: any;
  submissionStatuses: Map<number, any>;
  batchSubmissions: any;
  enrolledUsers: any[];
  users: Map<number, any>;
  forumDiscussions: any;
  authUsers: Map<string, { password: string; token: string; role: string }>;
  validTokens: Set<string>;

  applyGradeMutation: (assignmentId: number, userId: number, grade: number, feedback: string) => void;
  applyCreateUsersMutation: (params: any) => Array<{ id: number; username: string }>;
  applyCreateCoursesMutation: (params: any) => Array<{ id: number; shortname: string }>;
  applyEnrolUserMutation: (params: any) => void;
  applyAddDiscussionMutation: (params: any) => { discussionid: number };
}

export class FixtureLoader {
  private static fixtureDir = (() => {
    try {
      const currentFilePath = fileURLToPath(import.meta.url);
      const dir = path.resolve(path.dirname(currentFilePath), '../../fixtures');
      if (fs.existsSync(dir)) return dir;
    } catch {
      // fallback
    }
    return path.resolve(process.cwd(), 'tests/fixtures');
  })();

  private static cache: Map<string, any> = new Map();

  /**
   * Loads a fixture from tests/fixtures, caching parsed JSON and returning a deep clone.
   */
  public static getFixture<T = any>(filename: string): T {
    if (!this.cache.has(filename)) {
      const filePath = path.join(this.fixtureDir, filename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Fixture file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      this.cache.set(filename, JSON.parse(raw));
    }
    return structuredClone(this.cache.get(filename));
  }

  /**
   * Creates fresh in-memory LMS state cloned from static fixtures with stateful mutation methods.
   */
  public static createInitialState(): MockMoodleState {
    const siteInfo = this.getFixture('site-info.json');
    const courses = this.getFixture('users-courses.json');
    const courseContents = this.getFixture('course-contents.json');
    const calendarEvents = this.getFixture('calendar-events.json');
    const defaultGrades = this.getFixture('user-grades.json');
    const defaultSubmissionStatus = this.getFixture('submission-status.json');
    const batchSubmissions = this.getFixture('submissions-batch.json');
    const enrolledUsers = this.getFixture('enrolled-users.json');
    const searchUsersResult = this.getFixture('search-users.json');
    const forumDiscussions = this.getFixture('forum-discussions.json');

    const usersMap = new Map<number, any>();
    (searchUsersResult.users || []).forEach((u: any) => usersMap.set(u.id, u));

    const gradesByStudent = new Map<number, any>();
    // Seed default grades for user 42 and user 3
    gradesByStudent.set(42, structuredClone(defaultGrades));
    gradesByStudent.set(3, structuredClone(defaultGrades));

    const submissionStatuses = new Map<number, any>();
    submissionStatuses.set(10, structuredClone(defaultSubmissionStatus));
    submissionStatuses.set(101, structuredClone(defaultSubmissionStatus));

    const authUsers = new Map<string, { password: string; token: string; role: string }>();
    authUsers.set('student', { password: 'student123', token: 'mock-student-token-123', role: 'student' });
    authUsers.set('teacher', { password: 'teacher123', token: 'mock-teacher-token-456', role: 'teacher' });
    authUsers.set('admin', { password: 'admin123', token: 'mock-admin-token-789', role: 'admin' });

    const validTokens = new Set<string>([
      'mock-student-token-123',
      'mock-teacher-token-456',
      'mock-admin-token-789',
      '4a82b9c7e1d5f3a0b2c4e6f8a1d3e5b7',
      'mock-moodle-token-1234567890abcdef'
    ]);

    let nextUserId = 100;
    let nextCourseId = 50;
    let nextDiscussionId = 300;

    const state: MockMoodleState = {
      siteInfo,
      courses,
      courseContents,
      calendarEvents,
      defaultGrades,
      gradesByStudent,
      defaultSubmissionStatus,
      submissionStatuses,
      batchSubmissions,
      enrolledUsers,
      users: usersMap,
      forumDiscussions,
      authUsers,
      validTokens,

      applyGradeMutation(assignmentId: number, userId: number, grade: number, feedback: string) {
        // 1. Update user grade report
        if (!gradesByStudent.has(userId)) {
          gradesByStudent.set(userId, structuredClone(defaultGrades));
        }
        const studentGrades = gradesByStudent.get(userId);
        if (studentGrades?.usergrades?.[0]?.gradeitems) {
          const item = studentGrades.usergrades[0].gradeitems.find(
            (gi: any) => gi.iteminstance === assignmentId || gi.id === assignmentId
          );
          if (item) {
            item.graderaw = grade;
            item.gradeformatted = `${grade.toFixed(2)} %`;
            item.percentageformatted = `${grade.toFixed(2)} %`;
            item.feedback = `<p>${feedback}</p>`;
          }
        }

        // 2. Update batch submissions teacher view
        if (batchSubmissions?.assignments) {
          for (const a of batchSubmissions.assignments) {
            if (a.assignmentid === assignmentId || a.assignmentid === 10) {
              const sub = a.submissions?.find((s: any) => s.userid === userId);
              if (sub) {
                sub.gradingstatus = 'graded';
                sub.grade = grade;
              }
            }
          }
        }

        // 3. Update single submission status
        const subStatus = submissionStatuses.get(assignmentId);
        if (subStatus) {
          if (subStatus.lastattempt) {
            subStatus.lastattempt.gradingstatus = 'graded';
            subStatus.lastattempt.graded = true;
          }
          if (subStatus.feedback) {
            subStatus.feedback.grade = {
              ...(subStatus.feedback.grade || {}),
              assignment: assignmentId,
              userid: userId,
              grade: grade.toFixed(2),
            };
            subStatus.feedback.gradefordisplay = `${grade.toFixed(2)} / 100.00`;
          }
        }
      },

      applyCreateUsersMutation(params: any): Array<{ id: number; username: string }> {
        const newId = ++nextUserId;
        const username =
          params['users[0][username]'] ||
          params.username ||
          (params.users && params.users[0]?.username) ||
          `user_${newId}`;
        const email =
          params['users[0][email]'] ||
          params.email ||
          (params.users && params.users[0]?.email) ||
          `${username}@example.com`;
        const firstname =
          params['users[0][firstname]'] ||
          params.firstname ||
          (params.users && params.users[0]?.firstname) ||
          'Test';
        const lastname =
          params['users[0][lastname]'] ||
          params.lastname ||
          (params.users && params.users[0]?.lastname) ||
          'User';
        const fullname = `${firstname} ${lastname}`;

        const newUser = {
          id: newId,
          username,
          firstname,
          lastname,
          fullname,
          email,
          auth: 'manual',
          password: '$2y$10$dummyhashedpassword',
          passwordhash: '$2y$10$dummyhashedpassword',
          salt: 'dummysalt',
          suspended: false,
          confirmed: true,
        };
        usersMap.set(newId, newUser);
        return [{ id: newId, username }];
      },

      applyCreateCoursesMutation(params: any): Array<{ id: number; shortname: string }> {
        const newId = ++nextCourseId;
        const shortname =
          params['courses[0][shortname]'] ||
          params.shortname ||
          (params.courses && params.courses[0]?.shortname) ||
          `COURSE_${newId}`;
        const fullname =
          params['courses[0][fullname]'] ||
          params.fullname ||
          (params.courses && params.courses[0]?.fullname) ||
          `Course Fullname ${newId}`;
        const categoryid = Number(
          params['courses[0][categoryid]'] ||
          params.categoryid ||
          (params.courses && params.courses[0]?.categoryid) ||
          1
        );
        const summary =
          params['courses[0][summary]'] ||
          params.summary ||
          (params.courses && params.courses[0]?.summary) ||
          'Auto created course';

        const newCourse = {
          id: newId,
          shortname,
          fullname,
          displayname: `${shortname} - ${fullname}`,
          category: categoryid,
          summary: `<p>${summary}</p>`,
          summaryformat: 1,
          enrolledusercount: 0,
          visible: 1,
        };
        courses.push(newCourse);
        return [{ id: newId, shortname }];
      },

      applyEnrolUserMutation(params: any): void {
        const userId = Number(
          params['enrolments[0][userid]'] ||
          params.userid ||
          params.user_id ||
          (params.enrolments && params.enrolments[0]?.userid)
        );
        const user = usersMap.get(userId);
        const roleId = Number(
          params['enrolments[0][roleid]'] ||
          params.roleid ||
          params.role_id ||
          (params.enrolments && params.enrolments[0]?.roleid) ||
          5
        );

        if (user && !enrolledUsers.some((u: any) => u.id === userId)) {
          enrolledUsers.push({
            id: user.id,
            username: user.username,
            firstname: user.firstname || user.fullname.split(' ')[0],
            lastname: user.lastname || user.fullname.split(' ')[1] || '',
            fullname: user.fullname,
            email: user.email,
            roles: [{ roleid: roleId, name: roleId === 3 ? 'Teacher' : 'Student', shortname: roleId === 3 ? 'editingteacher' : 'student' }],
          });
        }
      },

      applyAddDiscussionMutation(params: any): { discussionid: number } {
        const discussionId = ++nextDiscussionId;
        const newDiscussion = {
          id: discussionId,
          discussion: discussionId,
          course: Number(params.courseid || params.course_id || 101),
          forum: Number(params.forumid || params.forum_id || 12),
          name: params.subject || 'Announcement',
          subject: params.subject || 'Announcement',
          message: `<p>${params.message || ''}</p>`,
          userfullname: 'Teacher',
          firstuserfullname: 'Teacher',
          timemodified: Math.floor(Date.now() / 1000),
          pinned: false,
          locked: false,
          numreplies: 0,
        };
        forumDiscussions.discussions = forumDiscussions.discussions || [];
        forumDiscussions.discussions.unshift(newDiscussion);
        return { discussionid: discussionId };
      },
    };

    return state;
  }
}
