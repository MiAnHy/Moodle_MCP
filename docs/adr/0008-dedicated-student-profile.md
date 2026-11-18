# 0008. Dedicated Student Profile

We decided to introduce a dedicated `student` role profile focused on academic productivity, deadline tracking, and study assistance.

## Context & Rationale
Students interact with Moodle very differently from teachers and administrators. They require fast access to deadlines, lecture resources, grades, and feedback, but must be strictly fenced from viewing other students' submissions or administrative functions.

The `student` profile exposes:
- `moodle_my_courses`
- `moodle_my_deadlines`
- `moodle_get_course_content`
- `moodle_my_grades`
- `moodle_my_submissions`
- `moodle_course_announcements`

All student endpoints are bound to the caller's user ID to enforce strict learner privacy.
