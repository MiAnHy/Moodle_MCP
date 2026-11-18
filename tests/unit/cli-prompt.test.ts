import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockPromptAdapter } from '../../src/cli/prompt.js';
import { runLoginCommand } from '../../src/cli/login.js';
import * as authModule from '../../src/cli/auth.js';
import { TokenExchangeService } from '../../src/moodle/token-exchange.js';
import { MoodleRestClient } from '../../src/moodle/client.js';

describe('Terminal Prompt Adapter & Login Command (Candidate 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('MockPromptAdapter answers matched questions', async () => {
    const mockPrompt = new MockPromptAdapter({
      url: 'https://moodle.example.edu',
      username: 'alice',
      password: 'secretpassword123',
    });

    const url = await mockPrompt.askText('Moodle Base URL: ');
    const user = await mockPrompt.askText('Moodle Username: ');
    const pass = await mockPrompt.askSecret('Moodle Password: ');

    expect(url).toBe('https://moodle.example.edu');
    expect(user).toBe('alice');
    expect(pass).toBe('secretpassword123');
    expect(mockPrompt.history).toHaveLength(3);
  });

  it('runLoginCommand runs end-to-end with injected PromptAdapter and zeroizes password', async () => {
    const mockPrompt = new MockPromptAdapter({
      url: 'https://moodle.test.local',
      username: 'testuser',
      password: 'mypassword',
    });

    const saveSpy = vi.spyOn(authModule, 'saveAuthConfig').mockImplementation(() => {});
    const zeroizeSpy = vi.spyOn(authModule, 'zeroizeString');
    const loginSpy = vi.spyOn(TokenExchangeService, 'login').mockResolvedValue('token_abc123');
    const callFunctionSpy = vi.spyOn(MoodleRestClient.prototype, 'callFunction').mockResolvedValue({
      sitename: 'Test Moodle',
      username: 'testuser',
      userid: 99,
      release: '4.5+',
    });

    await runLoginCommand(mockPrompt);

    expect(loginSpy).toHaveBeenCalledWith('https://moodle.test.local', 'testuser', 'mypassword');
    expect(zeroizeSpy).toHaveBeenCalled();
    expect(callFunctionSpy).toHaveBeenCalledWith('core_webservice_get_site_info', {}, 'token_abc123');
    expect(saveSpy).toHaveBeenCalledWith({
      url: 'https://moodle.test.local',
      token: 'token_abc123',
      username: 'testuser',
      userId: 99,
      sitename: 'Test Moodle',
    });
  });
});
