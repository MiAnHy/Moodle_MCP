import { listTeacherCoursesTool } from './teacher-courses.js';
import { getEnrolledStudentsTool } from './enrolled-students.js';
import { getAssignmentSubmissionsTool } from './assignment-submissions.js';
import { submitGradeTool } from './submit-grade.js';
import { postAnnouncementTool } from './post-announcement.js';

export const teacherTools = [
  listTeacherCoursesTool,
  getEnrolledStudentsTool,
  getAssignmentSubmissionsTool,
  submitGradeTool,
  postAnnouncementTool,
];
