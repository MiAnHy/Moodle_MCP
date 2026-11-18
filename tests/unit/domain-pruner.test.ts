import { describe, it, expect } from 'vitest';
import {
  pruneDeadlines,
  pruneAnnouncements,
  pruneCourseContents,
  semanticPruner,
} from '../../src/transformers/index.js';

describe('Domain Semantic Pruner (Candidate 1)', () => {
  describe('pruneDeadlines', () => {
    it('prunes calendar events with formatted ISO dates and Markdown descriptions', () => {
      const rawEvents = {
        events: [
          {
            id: 201,
            name: 'Assignment 1 Due',
            courseid: 10,
            modulename: 'assign',
            eventtype: 'due',
            timesort: 1700000000,
            description: '<p>Submit your <strong>draft</strong> here.</p>',
            action: { actionable: true, url: 'http://moodle/mod/assign/view.php?id=1' },
          },
        ],
      };

      const result = pruneDeadlines(rawEvents);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(201);
      expect(result[0].name).toBe('Assignment 1 Due');
      expect(result[0].courseid).toBe(10);
      expect(result[0].duedate_formatted).toBe(new Date(1700000000 * 1000).toISOString());
      expect(result[0].description).toBe('Submit your **draft** here.');
      expect(result[0].actionable).toBe(true);
      expect(result[0].action_url).toBe('http://moodle/mod/assign/view.php?id=1');
    });

    it('handles direct array input', () => {
      const rawList = [{ id: 5, name: 'Quiz Closing', timesort: 1600000000 }];
      const result = pruneDeadlines(rawList);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quiz Closing');
    });
  });

  describe('pruneAnnouncements', () => {
    it('prunes forum discussions and enforces indirect prompt injection fencing', () => {
      const raw = {
        discussions: [
          {
            id: 301,
            name: 'Important Announcement',
            course: 10,
            firstuserfullname: 'Prof. Turing',
            timemodified: 1700000000,
            numreplies: 3,
            pinned: true,
            message: '<p>Welcome! <em>Please read instructions.</em></p>',
          },
        ],
      };

      const result = pruneAnnouncements(raw, 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(301);
      expect(result[0].author).toBe('Prof. Turing');
      expect(result[0].pinned).toBe(true);
      expect(result[0].numreplies).toBe(3);
      expect(result[0].message).toContain('Welcome! *Please read instructions.*');
      expect(result[0].message).toContain('<user_content untrusted="true">');
    });
  });

  describe('pruneCourseContents', () => {
    it('prunes course contents tree with markdown summaries and module file metadata', () => {
      const rawSections = [
        {
          id: 1,
          name: 'Week 1: Introduction',
          section: 1,
          summary: '<p>Introductory <strong>lecture notes</strong>.</p>',
          visible: 1,
          modules: [
            {
              id: 101,
              name: 'Syllabus PDF',
              modname: 'resource',
              description: '<p>Read before class.</p>',
              url: 'http://moodle/mod/resource/view.php?id=101',
              visible: 1,
              contents: [
                {
                  type: 'file',
                  filename: 'syllabus.pdf',
                  filesize: 10240,
                  fileurl: 'http://moodle/files/syllabus.pdf',
                  mimetype: 'application/pdf',
                },
              ],
            },
          ],
        },
      ];

      const result = pruneCourseContents(rawSections);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('Week 1: Introduction');
      expect(result[0].summary).toBe('Introductory **lecture notes**.');
      expect(result[0].modules).toHaveLength(1);
      expect(result[0].modules[0].name).toBe('Syllabus PDF');
      expect(result[0].modules[0].description).toBe('Read before class.');
      expect(result[0].modules[0].files).toHaveLength(1);
      expect(result[0].modules[0].files![0].filename).toBe('syllabus.pdf');
      expect(result[0].modules[0].files![0].filesize).toBe(10240);
    });
  });

  describe('semanticPruner composite object', () => {
    it('exposes all domain methods', () => {
      expect(typeof semanticPruner.pruneDeadlines).toBe('function');
      expect(typeof semanticPruner.pruneAnnouncements).toBe('function');
      expect(typeof semanticPruner.pruneCourseContents).toBe('function');
    });
  });
});
