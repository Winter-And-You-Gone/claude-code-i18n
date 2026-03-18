import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

export interface ClaudeCodeInfo {
  cliPath: string;
  packageDir: string;
  version: string;
}

/**
 * Find Claude Code's cli.js by following the `claude` binary symlink.
 */
function findViaBinary(): string | null {
  try {
    const whichResult = execSync('which claude', { encoding: 'utf-8' }).trim();
    if (!whichResult) return null;

    // Follow symlink to find the real path
    const realPath = fs.realpathSync(whichResult);

    // cli.js might be the target itself, or in the same directory
    if (realPath.endsWith('cli.js') && fs.existsSync(realPath)) {
      return realPath;
    }

    // The binary might be a wrapper — check sibling cli.js
    const dir = path.dirname(realPath);
    const cliPath = path.join(dir, 'cli.js');
    if (fs.existsSync(cliPath)) {
      return cliPath;
    }

    // Walk up to find @anthropic-ai/claude-code/cli.js
    let current = dir;
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, 'cli.js');
      if (fs.existsSync(candidate) && current.includes('claude-code')) {
        return candidate;
      }
      current = path.dirname(current);
    }
  } catch {
    // `which` failed — claude not in PATH
  }
  return null;
}

/**
 * Find via npm global root.
 */
function findViaNpmGlobal(): string | null {
  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    const cliPath = path.join(npmRoot, '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(cliPath)) {
      return cliPath;
    }
  } catch {
    // npm not available
  }
  return null;
}

/**
 * Find in Volta tool directories.
 */
function findViaVolta(): string | null {
  const voltaHome = process.env.VOLTA_HOME || path.join(os.homedir(), '.volta');
  const nodeImagesDir = path.join(voltaHome, 'tools', 'image', 'node');

  if (!fs.existsSync(nodeImagesDir)) return null;

  try {
    const versions = fs.readdirSync(nodeImagesDir);
    for (const ver of versions.reverse()) {
      const cliPath = path.join(
        nodeImagesDir, ver, 'lib', 'node_modules',
        '@anthropic-ai', 'claude-code', 'cli.js'
      );
      if (fs.existsSync(cliPath)) {
        return cliPath;
      }
    }
  } catch {
    // volta dir not readable
  }
  return null;
}

/**
 * Scan common global node_modules paths.
 */
function findViaCommonPaths(): string | null {
  const home = os.homedir();
  const candidates: string[] = [];

  // macOS / Linux common paths
  candidates.push(
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js',
  );

  // nvm
  const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');
  if (fs.existsSync(nvmDir)) {
    const versionsDir = path.join(nvmDir, 'versions', 'node');
    try {
      const versions = fs.readdirSync(versionsDir);
      for (const ver of versions.reverse()) {
        candidates.push(
          path.join(versionsDir, ver, 'lib', 'node_modules',
            '@anthropic-ai', 'claude-code', 'cli.js')
        );
      }
    } catch {
      // nvm versions dir not readable
    }
  }

  // Windows
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    candidates.push(
      path.join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Read version from Claude Code's package.json.
 */
function readVersion(packageDir: string): string {
  try {
    const pkgPath = path.join(packageDir, 'package.json');
    const pkg = fs.readJsonSync(pkgPath);
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Find Claude Code's cli.js installation path.
 *
 * Search order:
 * 1. `which claude` → follow symlink
 * 2. `npm root -g` → @anthropic-ai/claude-code/cli.js
 * 3. ~/.volta/ scan
 * 4. Common global node_modules paths
 *
 * @throws Error with installation instructions if not found
 */
export async function findClaudeCodeCli(): Promise<ClaudeCodeInfo> {
  const strategies = [
    findViaBinary,
    findViaNpmGlobal,
    findViaVolta,
    findViaCommonPaths,
  ];

  for (const strategy of strategies) {
    const cliPath = strategy();
    if (cliPath) {
      const packageDir = path.dirname(cliPath);
      const version = readVersion(packageDir);
      return { cliPath, packageDir, version };
    }
  }

  throw new Error(
    'Could not find Claude Code installation.\n\n' +
    'Make sure Claude Code is installed globally:\n' +
    '  npm install -g @anthropic-ai/claude-code\n\n' +
    'If installed via Volta:\n' +
    '  volta install @anthropic-ai/claude-code\n\n' +
    'Then try again: cc-i18n patch --lang zh-TW'
  );
}

/**
 * Get all possible Claude Code installation paths for the current platform.
 */
export function getSearchPaths(): string[] {
  const paths: string[] = [];
  const home = os.homedir();

  try {
    const whichResult = execSync('which claude', { encoding: 'utf-8' }).trim();
    if (whichResult) paths.push(whichResult);
  } catch { /* not in PATH */ }

  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    paths.push(path.join(npmRoot, '@anthropic-ai', 'claude-code', 'cli.js'));
  } catch { /* npm not available */ }

  paths.push(
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    path.join(home, '.volta', 'tools', 'image', 'node'),
  );

  return paths;
}
