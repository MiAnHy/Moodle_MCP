import { htmlToMarkdown } from './html-to-markdown.js';
import { sanitizeUntrustedContent, stripSensitiveFields } from './sanitizer.js';
import { pruneCourse, pruneCourses } from './course-pruner.js';
import { pruneUser, pruneUsers } from './user-pruner.js';
import { pruneGrades } from './grade-pruner.js';
import type {
  PrunedCourse,
  PrunedUser,
  PrunedGradeItem,
  PrunedSubmission,
} from '../types/moodle.js';

export {
  htmlToMarkdown,
  sanitizeUntrustedContent,
  stripSensitiveFields,
  pruneCourse,
  pruneCourses,
  pruneUser,
  pruneUsers,
  pruneGrades,
};

export type {
  PrunedCourse,
  PrunedUser,
  PrunedGradeItem,
  PrunedSubmission,
};

export interface PrunedDeadline {
  id: number;
  name: string;
  courseid?: number;
  modulename?: string;
  eventtype?: string;
  timesort?: number;
  duedate_formatted?: string;
  description?: string;
  actionable: boolean;
  action_url?: string;
}

export interface PrunedAnnouncement {
  id: number;
  name: string;
  course?: number;
  author?: string;
  timemodified?: string;
  numreplies?: number;
  pinned: boolean;
  message?: string;
}

export interface PrunedCourseSection {
  id: number;
  name: string;
  section?: number;
  summary?: string;
  visible?: number;
  modules: Array<{
    id: number;
    name: string;
    modname: string;
    description?: string;
    url?: string;
    visible?: number;
    files?: Array<{
      filename: string;
      filesize: number;
      fileurl?: string;
      mimetype?: string;
    }>;
  }>;
}

export interface SemanticPruner {
  htmlToMarkdown(html: string): string;
  sanitizeUntrustedContent(content: string): string;
  stripSensitiveFields<T = any>(obj: T): T;
  pruneCourse(rawCourse: any): PrunedCourse;
  pruneCourses(rawCourses: any): PrunedCourse[];
  pruneUser(rawUser: any): PrunedUser;
  pruneUsers(rawUsers: any): PrunedUser[];
  pruneGrades(rawGrades: any): PrunedGradeItem[];
  pruneSubmissions(rawSubmissions: any): PrunedSubmission[];
  pruneDeadlines(rawEvents: any): PrunedDeadline[];
  pruneAnnouncements(rawDiscussions: any, limit?: number): PrunedAnnouncement[];
  pruneCourseContents(rawContents: any): PrunedCourseSection[];
}

/**
 * Prunes raw assignment submissions, extracting online text as fenced markdown
 * and formatting attached files.
 */
export function pruneSubmissions(rawSubmissions: any): PrunedSubmission[] {
  if (!rawSubmissions || typeof rawSubmissions !== 'object') {
    return [];
  }

  const submissionsList: Array<{ sub: any; assignmentId?: number }> = [];

  if (Array.isArray(rawSubmissions)) {
    for (const sub of rawSubmissions) {
      submissionsList.push({ sub, assignmentId: sub.assignmentid });
    }
  } else if (Array.isArray(rawSubmissions.assignments)) {
    for (const assignment of rawSubmissions.assignments) {
      if (Array.isArray(assignment.submissions)) {
        for (const sub of assignment.submissions) {
          submissionsList.push({ sub, assignmentId: assignment.id ?? assignment.assignmentid });
        }
      }
    }
  } else if (rawSubmissions.lastattempt?.submission) {
    submissionsList.push({
      sub: rawSubmissions.lastattempt.submission,
      assignmentId: rawSubmissions.lastattempt.submission.assignmentid,
    });
  }

  return submissionsList.map(({ sub, assignmentId }) => {
    let extractedText = '';
    const files: Array<{ filename: string; filesize: number; fileurl?: string }> = [];

    if (Array.isArray(sub.plugins)) {
      for (const plugin of sub.plugins) {
        if (plugin.type === 'onlinetext' && Array.isArray(plugin.editorfields)) {
          const rawHtml = plugin.editorfields[0]?.text || '';
          if (rawHtml) {
            const md = htmlToMarkdown(rawHtml);
            extractedText = sanitizeUntrustedContent(md);
          }
        } else if (plugin.type === 'file' && Array.isArray(plugin.fileareas)) {
          for (const area of plugin.fileareas) {
            if (Array.isArray(area.files)) {
              for (const f of area.files) {
                files.push({
                  filename: String(f.filename ?? ''),
                  filesize: Number(f.filesize ?? 0),
                  fileurl: f.fileurl ? String(f.fileurl) : undefined,
                });
              }
            }
          }
        }
      }
    }

    const pruned: PrunedSubmission = {
      id: Number(sub.id ?? 0),
      userid: Number(sub.userid ?? 0),
      attemptnumber: Number(sub.attemptnumber ?? 0),
      status: String(sub.status ?? ''),
    };

    if (assignmentId !== undefined) {
      pruned.assignmentid = Number(assignmentId);
    }

    if (sub.timemodified !== undefined) {
      pruned.timemodified = Number(sub.timemodified);
    }

    if (extractedText) {
      pruned.text = extractedText;
    }

    if (files.length > 0) {
      pruned.files = files;
    }

    if (sub.gradingstatus) {
      pruned.gradingstatus = String(sub.gradingstatus);
    }

    return pruned;
  });
}

/**
 * Prunes upcoming assignment and calendar event deadlines.
 */
export function pruneDeadlines(rawEvents: any): PrunedDeadline[] {
  const events = rawEvents?.events || (Array.isArray(rawEvents) ? rawEvents : []);
  if (!Array.isArray(events)) return [];

  return events.map((evt: any) => ({
    id: Number(evt.id ?? 0),
    name: String(evt.name ?? ''),
    courseid: evt.courseid ? Number(evt.courseid) : undefined,
    modulename: evt.modulename ? String(evt.modulename) : undefined,
    eventtype: evt.eventtype ? String(evt.eventtype) : undefined,
    timesort: evt.timesort ? Number(evt.timesort) : undefined,
    duedate_formatted: evt.timesort ? new Date(evt.timesort * 1000).toISOString() : undefined,
    description: evt.description ? htmlToMarkdown(evt.description) : undefined,
    actionable: evt.action?.actionable ?? true,
    action_url: evt.action?.url ? String(evt.action.url) : undefined,
  }));
}

/**
 * Prunes forum announcements, automatically applying prompt-injection fencing.
 */
export function pruneAnnouncements(rawDiscussions: any, limit = 10): PrunedAnnouncement[] {
  const rawList = Array.isArray(rawDiscussions)
    ? rawDiscussions
    : Array.isArray(rawDiscussions?.discussions)
    ? rawDiscussions.discussions
    : [];

  const discussions = rawList.slice(0, limit);

  return discussions.map((d: any) => ({
    id: Number(d.id ?? 0),
    name: String(d.name ?? ''),
    course: d.course ? Number(d.course) : undefined,
    author: d.firstuserfullname ? String(d.firstuserfullname) : undefined,
    timemodified: d.timemodified ? new Date(d.timemodified * 1000).toISOString() : undefined,
    numreplies: typeof d.numreplies === 'number' ? d.numreplies : undefined,
    pinned: Boolean(d.pinned),
    message: d.message ? sanitizeUntrustedContent(htmlToMarkdown(d.message)) : undefined,
  }));
}

/**
 * Prunes course contents hierarchy into sections, activities, and files.
 */
export function pruneCourseContents(rawContents: any): PrunedCourseSection[] {
  const rawSections = Array.isArray(rawContents) ? rawContents : [];

  return rawSections.map((sec: any) => ({
    id: Number(sec.id ?? 0),
    name: String(sec.name ?? ''),
    section: typeof sec.section === 'number' ? sec.section : undefined,
    summary: sec.summary ? htmlToMarkdown(sec.summary) : '',
    visible: typeof sec.visible === 'number' ? sec.visible : undefined,
    modules: Array.isArray(sec.modules)
      ? sec.modules.map((mod: any) => ({
          id: Number(mod.id ?? 0),
          name: String(mod.name ?? ''),
          modname: String(mod.modname ?? 'module'),
          description: mod.description ? htmlToMarkdown(mod.description) : undefined,
          url: mod.url ? String(mod.url) : undefined,
          visible: typeof mod.visible === 'number' ? mod.visible : undefined,
          files: Array.isArray(mod.contents)
            ? mod.contents
                .filter((c: any) => c.type === 'file')
                .map((f: any) => ({
                  filename: String(f.filename ?? ''),
                  filesize: Number(f.filesize ?? 0),
                  fileurl: f.fileurl ? String(f.fileurl) : undefined,
                  mimetype: f.mimetype ? String(f.mimetype) : undefined,
                }))
            : [],
        }))
      : [],
  }));
}

/**
 * Composite SemanticPruner instance implementing the unified transformation contract.
 */
export const semanticPruner: SemanticPruner = {
  htmlToMarkdown,
  sanitizeUntrustedContent,
  stripSensitiveFields,
  pruneCourse,
  pruneCourses,
  pruneUser,
  pruneUsers,
  pruneGrades,
  pruneSubmissions,
  pruneDeadlines,
  pruneAnnouncements,
  pruneCourseContents,
};
