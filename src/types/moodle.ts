/**
 * Moodle Type Definitions
 */

export interface MoodleClientConfig {
  baseUrl: string;
  token?: string;
  defaultToken?: string;
  allowPrivateNetwork?: boolean;
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
  maxPayloadSize?: number;
}

export interface MoodleTokenResponse {
  token: string;
  privatetoken?: string | null;
  error?: string;
  errorcode?: string;
}

export interface MoodleRestErrorResponse {
  exception?: string;
  errorcode?: string;
  message?: string;
  debuginfo?: string;
}

export interface MoodleClient {
  login(username: string, password: string, service?: string): Promise<{ token: string; privatetoken?: string }>;
  callFunction<T = any>(functionName: string, parameters?: Record<string, any>, token?: string): Promise<T>;
}

export interface PrunedCourse {
  id: number;
  shortname: string;
  fullname: string;
  summary: string;
  categoryid?: number;
  progress?: number;
  enrolledusercount?: number;
}

export interface PrunedUser {
  id: number;
  username: string;
  fullname: string;
  email: string;
  roles?: string[];
  department?: string;
}

export interface PrunedGradeItem {
  id?: number;
  itemname: string;
  itemtype?: string;
  grade: string | number;
  grademax?: number;
  percentage?: string;
  feedback?: string;
  range?: string;
}

export interface PrunedSubmission {
  id: number;
  assignmentid?: number;
  userid: number;
  attemptnumber: number;
  status: string;
  timemodified?: number;
  text?: string;
  files?: Array<{
    filename: string;
    filesize: number;
    fileurl?: string;
  }>;
  gradingstatus?: string;
}
