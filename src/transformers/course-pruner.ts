import { htmlToMarkdown } from './html-to-markdown.js';
import type { PrunedCourse } from '../types/moodle.js';

export type { PrunedCourse };

/**
 * Prunes raw Moodle course API responses, stripping formatting flags,
 * sorting order, and CMS metadata, while converting summary HTML to clean Markdown.
 */
export function pruneCourse(rawCourse: any): PrunedCourse {
  if (!rawCourse || typeof rawCourse !== 'object') {
    return {
      id: 0,
      shortname: '',
      fullname: '',
      summary: '',
    };
  }

  // Handle summary as string or Moodle summary object { text, format }
  let rawSummary = '';
  if (typeof rawCourse.summary === 'string') {
    rawSummary = rawCourse.summary;
  } else if (rawCourse.summary && typeof rawCourse.summary === 'object' && rawCourse.summary.text) {
    rawSummary = String(rawCourse.summary.text);
  }

  const pruned: PrunedCourse = {
    id: Number(rawCourse.id ?? 0),
    shortname: String(rawCourse.shortname ?? ''),
    fullname: String(rawCourse.fullname ?? ''),
    summary: htmlToMarkdown(rawSummary),
  };

  const categoryId = rawCourse.category ?? rawCourse.categoryid;
  if (categoryId !== undefined && categoryId !== null) {
    pruned.categoryid = Number(categoryId);
  }

  if (rawCourse.progress !== undefined && rawCourse.progress !== null) {
    pruned.progress = Number(rawCourse.progress);
  }

  if (rawCourse.enrolledusercount !== undefined && rawCourse.enrolledusercount !== null) {
    pruned.enrolledusercount = Number(rawCourse.enrolledusercount);
  }

  return pruned;
}

/**
 * Prunes an array of raw Moodle courses.
 */
export function pruneCourses(rawCourses: any): PrunedCourse[] {
  if (!rawCourses) {
    return [];
  }
  const list = Array.isArray(rawCourses) ? rawCourses : [rawCourses];
  return list.map(pruneCourse);
}
