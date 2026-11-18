import readline from 'node:readline';
import { zeroizeString } from './auth.js';

export interface PromptAdapter {
  askText(question: string): Promise<string>;
  askSecret(question: string): Promise<string>;
  close(): void;
}

/**
 * Terminal Prompt Adapter for interactive CLI commands.
 * Encapsulates Node readline interfaces, raw TTY event listening,
 * character masking (*), and backspace erasure.
 */
export class TerminalPrompt implements PromptAdapter {
  constructor(
    private stdin: NodeJS.ReadStream = process.stdin,
    private stdout: NodeJS.WriteStream = process.stdout
  ) {}

  askText(query: string): Promise<string> {
    const rl = readline.createInterface({
      input: this.stdin,
      output: this.stdout,
    });

    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  askSecret(query: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: this.stdin,
        output: this.stdout,
      });

      this.stdout.write(query);

      let secret = '';
      const onData = (char: Buffer) => {
        const str = char.toString('utf-8');
        switch (str) {
          case '\n':
          case '\r':
          case '\u0004':
            this.stdin.removeListener('data', onData);
            break;
          case '\u0003': // Ctrl+C
            zeroizeString(secret);
            process.exit(1);
            break;
          case '\u0008': // Backspace
          case '\x7f':
            if (secret.length > 0) {
              secret = secret.slice(0, -1);
              this.stdout.write('\b \b');
            }
            break;
          default:
            secret += str;
            this.stdout.write('*');
            break;
        }
      };

      if (this.stdin.isTTY) {
        this.stdin.setRawMode(true);
        this.stdin.resume();
        this.stdin.on('data', onData);
      }

      rl.question('', () => {
        if (this.stdin.isTTY) {
          this.stdin.setRawMode(false);
        }
        rl.close();
        this.stdout.write('\n');
        resolve(secret);
      });
    });
  }

  close(): void {}
}

/**
 * In-memory Mock Prompt Adapter for deterministic unit testing.
 */
export class MockPromptAdapter implements PromptAdapter {
  private responses: Map<string, string> = new Map();
  public history: string[] = [];

  constructor(responses: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(responses)) {
      this.responses.set(k.toLowerCase(), v);
    }
  }

  setResponse(pattern: string, response: string): void {
    this.responses.set(pattern.toLowerCase(), response);
  }

  private matchResponse(question: string): string {
    this.history.push(question);
    const qLower = question.toLowerCase();
    for (const [key, val] of this.responses.entries()) {
      if (qLower.includes(key)) {
        return val;
      }
    }
    return '';
  }

  async askText(question: string): Promise<string> {
    return this.matchResponse(question);
  }

  async askSecret(question: string): Promise<string> {
    return this.matchResponse(question);
  }

  close(): void {}
}
