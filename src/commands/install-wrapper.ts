import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createSpinner } from '../ui/spinner.js';

const WRAPPER_DIR = path.join(os.homedir(), '.local', 'bin');
const WRAPPER_PATH = path.join(WRAPPER_DIR, 'claude');

function getWrapperScript(): string {
  return `#!/bin/bash
# cc-i18n auto-repatch wrapper v2
# Installed by: cc-i18n install-wrapper
# Safe to remove: rm ~/.local/bin/claude

STATE_FILE="$HOME/.cc-i18n/state.json"

# 找真正的 claude（跳過自己）
SELF="$(realpath "$0" 2>/dev/null || readlink -f "$0")"
REAL_CLAUDE=""
while IFS= read -r p; do
  RESOLVED="$(realpath "$p" 2>/dev/null || readlink -f "$p" 2>/dev/null || echo "$p")"
  if [ "$RESOLVED" != "$SELF" ]; then
    REAL_CLAUDE="$p"
    break
  fi
done < <(which -a claude 2>/dev/null)

if [ -z "$REAL_CLAUDE" ]; then
  echo "❌ cc-i18n wrapper: 找不到 claude 本體" >&2
  exit 1
fi

# state.json 不存在 → 直接啟動
if [ ! -f "$STATE_FILE" ]; then
  exec "$REAL_CLAUDE" "$@"
fi

# 讀欄位（locale, cliMd5, cliPath）
LANG_CODE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('locale',''))" 2>/dev/null || echo "")
SAVED_MD5=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('cliMd5',''))" 2>/dev/null || echo "")
CLI_PATH=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('cliPath',''))" 2>/dev/null || echo "")

# 缺資料 → 跳過
if [ -z "$LANG_CODE" ] || [ -z "$CLI_PATH" ] || [ -z "$SAVED_MD5" ]; then
  exec "$REAL_CLAUDE" "$@"
fi

[ ! -f "$CLI_PATH" ] && exec "$REAL_CLAUDE" "$@"

# 比對 MD5
CURRENT_MD5=$(md5 -q "$CLI_PATH" 2>/dev/null || md5sum "$CLI_PATH" 2>/dev/null | cut -d' ' -f1 || echo "")

if [ "$CURRENT_MD5" = "$SAVED_MD5" ]; then
  exec "$REAL_CLAUDE" "$@"
fi

# 不一致 → 自動 repatch
echo "🔄 CC 已更新，正在重新套用翻譯..." >&2
if command -v cc-i18n &>/dev/null; then
  if CC_I18N_AUTO=1 timeout 30 cc-i18n patch --lang "$LANG_CODE" >&2 2>&1; then
    echo "✅ 翻譯已恢復" >&2
  else
    echo "⚠️ 自動修復失敗，啟動英文版。稍後手動跑：cc-i18n patch --lang $LANG_CODE" >&2
  fi
else
  echo "⚠️ cc-i18n 未安裝，跳過修復" >&2
fi

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
