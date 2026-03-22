import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createSpinner } from '../ui/spinner.js';

const WRAPPER_DIR = path.join(os.homedir(), '.local', 'bin');
const WRAPPER_PATH = path.join(WRAPPER_DIR, 'claude');

function getWrapperScript(): string {
  return `#!/usr/bin/env bash
# cc-i18n wrapper — auto re-patches Claude Code after updates
# Installed by: cc-i18n install-wrapper
# Safe to remove: rm ~/.local/bin/claude

set -euo pipefail

# Find the real claude binary (skip this wrapper)
find_real_claude() {
  local self
  self="$(realpath "\${BASH_SOURCE[0]}" 2>/dev/null || readlink -f "\${BASH_SOURCE[0]}")"

  # Search PATH, skipping our wrapper
  IFS=':' read -ra dirs <<< "$PATH"
  for dir in "\${dirs[@]}"; do
    local candidate="$dir/claude"
    if [[ -x "$candidate" ]] && [[ "$(realpath "$candidate" 2>/dev/null || readlink -f "$candidate")" != "$self" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

REAL_CLAUDE="$(find_real_claude)" || {
  echo "cc-i18n wrapper: cannot find real claude binary" >&2
  exit 1
}

# Auto re-patch check (silent, non-blocking)
if command -v cc-i18n &>/dev/null; then
  cc-i18n check-update --quiet 2>/dev/null || true
fi

# Pass through to real claude
exec "$REAL_CLAUDE" "$@"
`;
}

export async function installWrapperCommand(): Promise<void> {
  const spinner = createSpinner();

  try {
    // 1. Create directory
    spinner.start('Creating ~/.local/bin/...');
    await fs.ensureDir(WRAPPER_DIR);
    spinner.succeed('~/.local/bin/ ready');

    // 2. Check for existing file
    if (await fs.pathExists(WRAPPER_PATH)) {
      const existing = await fs.readFile(WRAPPER_PATH, 'utf-8');
      if (existing.includes('cc-i18n wrapper')) {
        spinner.start('Updating existing wrapper...');
      } else {
        // Not our wrapper — don't overwrite
        console.log(chalk.yellow(`\n  ~/.local/bin/claude already exists and is not a cc-i18n wrapper.`));
        console.log(chalk.yellow(`  To avoid breaking your setup, skipping installation.`));
        console.log(chalk.dim(`  Remove it manually first if you want to install the wrapper.`));
        return;
      }
    }

    // 3. Write wrapper
    spinner.start('Installing wrapper...');
    await fs.writeFile(WRAPPER_PATH, getWrapperScript(), { mode: 0o755 });
    spinner.succeed('Wrapper installed at ~/.local/bin/claude');

    // 4. Check PATH
    const pathDirs = (process.env.PATH || '').split(':');
    const inPath = pathDirs.some(d => {
      try {
        return fs.realpathSync(d) === fs.realpathSync(WRAPPER_DIR);
      } catch {
        return d === WRAPPER_DIR;
      }
    });

    if (!inPath) {
      console.log();
      console.log(chalk.yellow('  ~/.local/bin is not in your PATH. Add it:'));
      console.log();
      console.log(chalk.cyan(`    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`));
      console.log(chalk.cyan(`    source ~/.zshrc`));
      console.log();
    }

    // 5. Verify
    try {
      const which = execSync('which claude', { encoding: 'utf-8' }).trim();
      const realWhich = fs.realpathSync(which);
      const realWrapper = fs.realpathSync(WRAPPER_PATH);

      if (realWhich === realWrapper) {
        console.log(chalk.green('\n  Wrapper is active. Claude Code will auto re-patch after updates.'));
      } else {
        console.log(chalk.yellow(`\n  Note: 'which claude' resolves to ${which}`));
        console.log(chalk.yellow(`  The wrapper at ~/.local/bin/claude needs to come first in PATH.`));
        console.log(chalk.dim(`  Ensure ~/.local/bin is before other paths in your PATH.`));
      }
    } catch {
      console.log(chalk.dim('\n  Could not verify wrapper activation. Make sure ~/.local/bin is in PATH.'));
    }

    console.log();
    console.log(chalk.dim('  To remove: rm ~/.local/bin/claude'));

  } catch (err) {
    spinner.fail(`Install failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
