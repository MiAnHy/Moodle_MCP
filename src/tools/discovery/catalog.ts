import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CatalogFunctionEntry {
  name: string;
  description: string;
  component: string;
  parameters: Record<string, any>;
  returns: Record<string, any>;
}

export class FunctionCatalogService {
  private static instance: FunctionCatalogService | null = null;
  private functions: Map<string, CatalogFunctionEntry> = new Map();

  // Denylist of internal dangerous or deprecated functions
  private blockedFunctions = new Set([
    'tool_installaddon_install_addon',
    'core_admin_run_cli',
    'core_maintenance_enable',
    'core_upgrade_database',
  ]);

  // Mutation keywords for automated Two-Phase Mutation detection
  private mutationKeywords = [
    'create',
    'update',
    'delete',
    'save',
    'add',
    'enrol',
    'set',
    'remove',
    'assign',
    'submit',
    'drop',
    'insert',
  ];

  constructor() {
    this.loadCatalog();
  }

  public static getInstance(): FunctionCatalogService {
    if (!FunctionCatalogService.instance) {
      FunctionCatalogService.instance = new FunctionCatalogService();
    }
    return FunctionCatalogService.instance;
  }

  private loadCatalog(): void {
    try {
      const currentFilePath = fileURLToPath(import.meta.url);
      const catalogPath = path.resolve(path.dirname(currentFilePath), '../../data/moodle-catalog.json');
      if (fs.existsSync(catalogPath)) {
        const raw = fs.readFileSync(catalogPath, 'utf8');
        const list: CatalogFunctionEntry[] = JSON.parse(raw);
        for (const item of list) {
          this.functions.set(item.name, item);
        }
      }
    } catch {
      // Fallback empty catalog
    }
  }

  public search(query: string, limit = 10): CatalogFunctionEntry[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return Array.from(this.functions.values()).slice(0, limit);
    }

    const tokens = trimmed.split(/\s+/);
    const scored: Array<{ entry: CatalogFunctionEntry; score: number }> = [];

    for (const entry of this.functions.values()) {
      if (this.blockedFunctions.has(entry.name)) {
        continue;
      }

      let score = 0;
      const nameLower = entry.name.toLowerCase();
      const descLower = entry.description.toLowerCase();
      const compLower = entry.component.toLowerCase();

      for (const token of tokens) {
        if (nameLower === token) score += 50;
        else if (nameLower.includes(token)) score += 20;
        if (compLower.includes(token)) score += 10;
        if (descLower.includes(token)) score += 5;
      }

      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.entry);
  }

  public describe(functionName: string): CatalogFunctionEntry | undefined {
    if (this.blockedFunctions.has(functionName)) {
      return undefined;
    }
    return this.functions.get(functionName);
  }

  public isAllowed(functionName: string): boolean {
    return !this.blockedFunctions.has(functionName);
  }

  public isMutating(functionName: string): boolean {
    const lower = functionName.toLowerCase();
    return this.mutationKeywords.some((keyword) => lower.includes(keyword));
  }
}
