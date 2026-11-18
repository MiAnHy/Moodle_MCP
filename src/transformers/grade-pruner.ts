import { htmlToMarkdown } from './html-to-markdown.js';
import type { PrunedGradeItem } from '../types/moodle.js';

export type { PrunedGradeItem };

/**
 * Flattens hierarchical Moodle gradebook responses into a compact, clean list of grade items.
 * Converts HTML teacher feedback into clean Markdown.
 */
export function pruneGrades(rawGrades: any): PrunedGradeItem[] {
  if (!rawGrades || typeof rawGrades !== 'object') {
    return [];
  }

  let items: any[] = [];

  if (Array.isArray(rawGrades)) {
    items = rawGrades;
  } else if (Array.isArray(rawGrades.usergrades)) {
    for (const ug of rawGrades.usergrades) {
      if (Array.isArray(ug.gradeitems)) {
        items.push(...ug.gradeitems);
      }
    }
  } else if (Array.isArray(rawGrades.gradeitems)) {
    items = rawGrades.gradeitems;
  }

  return items.map((item) => {
    const rawFeedback = typeof item.feedback === 'string' ? item.feedback : '';

    const pruned: PrunedGradeItem = {
      id: item.id !== undefined && item.id !== null ? Number(item.id) : undefined,
      itemname: String(item.itemname ?? ''),
      grade: item.gradeformatted ?? item.graderaw ?? '',
    };

    if (item.itemtype) {
      pruned.itemtype = String(item.itemtype);
    }

    if (item.grademax !== undefined && item.grademax !== null) {
      pruned.grademax = Number(item.grademax);
    }

    if (item.percentageformatted) {
      pruned.percentage = String(item.percentageformatted);
    } else if (item.gradeformatted && String(item.gradeformatted).includes('%')) {
      pruned.percentage = String(item.gradeformatted);
    }

    if (rawFeedback) {
      pruned.feedback = htmlToMarkdown(rawFeedback);
    }

    if (item.rangeformatted) {
      pruned.range = String(item.rangeformatted);
    }

    return pruned;
  });
}
