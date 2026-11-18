import { TokenExchangeService } from '../moodle/token-exchange.js';
import { MoodleRestClient } from '../moodle/client.js';
import { saveAuthConfig, zeroizeString } from './auth.js';
import { PromptAdapter, TerminalPrompt } from './prompt.js';

export { PromptAdapter, TerminalPrompt };

/**
 * Executes the interactive login command.
 */
export async function runLoginCommand(
  prompt: PromptAdapter = new TerminalPrompt()
): Promise<void> {
  console.log('\n===========================================');
  console.log('       Moodle MCP Server - Login Setup     ');
  console.log('===========================================\n');
  console.log('Log in directly with your standard Moodle credentials.');
  console.log('Your password will be exchanged for a scoped token and immediately erased from memory.\n');

  let rawUrl = '';
  let username = '';
  let password = '';

  try {
    rawUrl = await prompt.askText('Moodle Base URL (e.g. https://moodle.school.edu): ');
    while (!rawUrl) {
      console.log('Error: Moodle Base URL is required.');
      rawUrl = await prompt.askText('Moodle Base URL: ');
    }

    username = await prompt.askText('Moodle Username: ');
    while (!username) {
      console.log('Error: Username is required.');
      username = await prompt.askText('Moodle Username: ');
    }

    // Password entry
    password = await prompt.askSecret('Moodle Password: ');
    while (!password) {
      console.log('Error: Password cannot be empty.');
      password = await prompt.askSecret('Moodle Password: ');
    }

    console.log('\nAuthenticating with Moodle (/login/token.php)...');

    const cleanUrl = rawUrl.replace(/\/+$/, '');
    const token = await TokenExchangeService.login(cleanUrl, username, password);

    // Immediate password zeroization
    zeroizeString(password);
    password = '';

    console.log('Authentication successful! Verifying permissions and fetching site info...');

    const client = new MoodleRestClient({
      baseUrl: cleanUrl,
      defaultToken: token,
    });

    const siteInfo = await client.callFunction('core_webservice_get_site_info', {}, token);

    saveAuthConfig({
      url: cleanUrl,
      token,
      username: siteInfo.username || username,
      userId: siteInfo.userid,
      sitename: siteInfo.sitename,
    });

    console.log('\n===========================================');
    console.log('       Successfully Connected to Moodle!   ');
    console.log('===========================================');
    console.log(`- Site:      ${siteInfo.sitename || cleanUrl}`);
    console.log(`- User:      ${siteInfo.fullname || username} (ID: ${siteInfo.userid})`);
    console.log(`- Release:   ${siteInfo.release || 'Unknown'}`);
    console.log(`- Config:    Saved securely to ~/.moodle/auth.json (mode 0600)`);
    console.log('\nYou can now run moodle-mcp with Claude Desktop, Cursor, Antigravity, or ChatGPT!\n');
  } catch (error: any) {
    if (password) {
      zeroizeString(password);
    }
    console.error(`\nLogin failed: ${error.message || String(error)}`);
    if (prompt instanceof TerminalPrompt) {
      process.exit(1);
    }
    throw error;
  } finally {
    prompt.close();
  }
}
