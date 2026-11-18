import type { PrunedUser } from '../types/moodle.js';

export type { PrunedUser };

/**
 * Prunes raw Moodle user API responses, removing password hashes, salts,
 * session keys, and internal tracking timestamps, while preserving essential identity fields.
 */
export function pruneUser(rawUser: any): PrunedUser {
  if (!rawUser || typeof rawUser !== 'object') {
    return {
      id: 0,
      username: '',
      fullname: '',
      email: '',
    };
  }

  // Derive fullname if missing
  let fullname = rawUser.fullname;
  if (!fullname && (rawUser.firstname || rawUser.lastname)) {
    fullname = `${rawUser.firstname || ''} ${rawUser.lastname || ''}`.trim();
  }

  // Normalize roles: convert [{ shortname: 'student' }] or ['student'] to string[]
  let roles: string[] | undefined;
  if (Array.isArray(rawUser.roles) && rawUser.roles.length > 0) {
    roles = rawUser.roles.map((r: any) => {
      if (typeof r === 'string') return r;
      if (r && typeof r === 'object' && r.shortname) return String(r.shortname);
      return String(r);
    });
  }

  const pruned: PrunedUser = {
    id: Number(rawUser.id ?? 0),
    username: String(rawUser.username ?? ''),
    fullname: String(fullname ?? ''),
    email: String(rawUser.email ?? ''),
  };

  if (roles && roles.length > 0) {
    pruned.roles = roles;
  }

  if (rawUser.department) {
    pruned.department = String(rawUser.department);
  }

  return pruned;
}

/**
 * Prunes an array of raw Moodle users.
 */
export function pruneUsers(rawUsers: any): PrunedUser[] {
  if (!rawUsers) {
    return [];
  }
  const list = Array.isArray(rawUsers) ? rawUsers : [rawUsers];
  return list.map(pruneUser);
}
