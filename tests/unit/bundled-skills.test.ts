import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { allTools } from '../../src/tools/index.js';

describe('Bundled Agent Skills Verification (Ticket 08)', () => {
  const skillsDir = path.resolve(process.cwd(), '.moodle/skills');
  const expectedSkills = [
    'moodle-student-tutor',
    'moodle-grading-assistant',
    'moodle-course-designer',
    'moodle-admin-ops',
  ];

  it('contains all 4 core agent skill directories with SKILL.md', () => {
    expect(fs.existsSync(skillsDir)).toBe(true);

    for (const skillName of expectedSkills) {
      const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
      const content = fs.readFileSync(skillPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    }
  });

  it('validates skill frontmatter, metadata, and references valid tools', () => {
    const validToolNames = new Set(allTools.map((t) => t.name));

    for (const skillName of expectedSkills) {
      const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf-8');

      // Check YAML frontmatter presence
      expect(content).toMatch(/^---\n[\s\S]+?\n---\n/);

      // Check required fields
      expect(content).toContain(`name: ${skillName}`);
      expect(content).toContain('description:');
      expect(content).toContain('version:');
      expect(content).toContain('tools:');

      // Extract referenced tools
      const lines = content.split('\n');
      let inTools = false;
      const toolsReferenced: string[] = [];

      for (const line of lines) {
        if (line.startsWith('tools:')) {
          inTools = true;
          continue;
        }
        if (inTools) {
          if (line.startsWith('  - moodle_')) {
            toolsReferenced.push(line.replace('  - ', '').trim());
          } else if (line.startsWith('---') || !line.startsWith('  -')) {
            inTools = false;
          }
        }
      }

      expect(toolsReferenced.length).toBeGreaterThan(0);
      for (const tool of toolsReferenced) {
        expect(
          validToolNames.has(tool),
          `Tool '${tool}' in skill '${skillName}' is not defined in allTools`
        ).toBe(true);
      }
    }
  });

  it('verifies enterprise prompt injection defenses and guardrails in skills', () => {
    for (const skillName of expectedSkills) {
      const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf-8');

      // Must enforce prompt injection defense or two-phase confirmation guardrails
      const hasSecurityOrGuardrails =
        content.includes('Prompt Injection') ||
        content.includes('Two-Phase') ||
        content.includes('untrusted') ||
        content.includes('Security');

      expect(hasSecurityOrGuardrails).toBe(true);
    }
  });
});
