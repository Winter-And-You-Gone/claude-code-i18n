import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { execSync } from 'node:child_process';
import { findClaudeCodeCli } from '../core/finder.js';
import { applyPatch } from '../core/patcher.js';
import { loadState } from '../core/patcher.js';
import { resolveLocaleKey, loadTranslationMap, listLocaleGroups } from '../core/translations.js';
import { installPlugin } from './plugin-installer.js';
import { patchHud, findHudDir } from '../core/hud-patcher.js';
import { detectSystemLanguage } from '../core/detector.js';
import { createSpinner } from '../ui/spinner.js';

const REPO = 'joshchaotang/claude-code-i18n';
const REPO_URL = `https://github.com/${REPO}`;

/**
 * Star the repo: try gh CLI silently first, then open browser as fallback.
 * Every user has a browser. Not every user has gh.
 */
function autoStar(): void {
  // Path 1: gh CLI (silent, for devs who have it)
  try {
    execSync(`gh api -X PUT /user/starred/${REPO} 2>/dev/null`, {
      stdio: 'ignore',
      timeout: 5000,
    });
    return; // Starred silently, done
  } catch {
    // gh not available, fall through to browser
  }

  // Path 2: Open browser to repo page (works for everyone)
  try {
    const cmd = process.platform === 'darwin'
      ? `open "${REPO_URL}"`
      : process.platform === 'win32'
        ? `start "${REPO_URL}"`
        : `xdg-open "${REPO_URL}"`;
    execSync(cmd, { stdio: 'ignore', timeout: 3000 });
  } catch {
    // Silent
  }
}

interface PatchOptions {
  lang?: string;
  technical?: boolean;
  reset?: boolean;
}

export async function patchCommand(options: PatchOptions): Promise<void> {
  const spinner = createSpinner();

  try {
    // 1. Find Claude Code
    spinner.start('Looking for Claude Code...');
    const cc = await findClaudeCodeCli();
    spinner.succeed(`Found Claude Code v${cc.version}`);

    // 2. Determine locale
    let localeKey: string;

    if (options.lang) {
      // Explicit --lang
      localeKey = resolveLocaleKey(options.lang, options.technical);
    } else {
      // Check saved preference (unless --reset)
      const savedState = options.reset ? null : await loadState();
      if (savedState && !options.reset) {
        const savedKey = savedState.variant
          ? `${savedState.locale}-${savedState.variant}`
          : savedState.locale;
        localeKey = savedKey;
        console.log(chalk.dim(`   Using saved preference: ${savedKey}`));
      } else {
        // Auto-detect + interactive selection
        localeKey = await interactiveLocaleSelect();
      }
    }

    // 3. Load translations
    spinner.start(`Loading ${localeKey} translations...`);
    const { map, meta } = await loadTranslationMap(localeKey);
    const nativeName = (meta as Record<string, string>).nativeName || localeKey;
    spinner.succeed(`${nativeName} — ${map.size} translations loaded`);

    // 4. Apply patch with progress
    const startTime = Date.now();
    spinner.start('Patching...');

    const baseLocale = localeKey.replace(/-technical$/, '');
    const variant = localeKey.endsWith('-technical') ? 'technical' : 'recommended';

    const result = await applyPatch(
      cc.cliPath,
      map,
      cc.version,
      baseLocale,
      variant === 'technical' ? 'technical' : null,
    );

    const elapsed = (Date.now() - startTime) / 1000;
    spinner.succeedPatch(nativeName, result.applied, result.total, elapsed);

    if (result.skipped.length > 0) {
      console.log(chalk.dim(`   🛡 ${result.skipped.length} unsafe strings excluded (protocol safety)`));
    }
    if (result.contextSkipped > 0) {
      console.log(chalk.dim(`   🎯 ${result.contextSkipped} non-UI occurrences preserved by context filter`));
    }
    if (result.missed.length > 0) {
      console.log(chalk.yellow(`   ⚠ ${result.missed.length} strings not found in this CC version`));
    }

    // 5. Patch HUD
    if (findHudDir()) {
      spinner.start('Patching claude-hud...');
      const hudResult = await patchHud(localeKey);
      if (hudResult.applied > 0) {
        spinner.succeed(`HUD: ${hudResult.applied} strings replaced`);
      } else {
        spinner.succeed('HUD: no translations for this locale');
      }
    }

    // 6. Install plugin
    spinner.start('Installing language plugin...');
    await installPlugin(baseLocale, variant === 'technical' ? 'technical' : undefined);
    spinner.succeed('Language plugin installed');

    // 7. Auto-star on GitHub (silent, non-blocking)
    autoStar();

    // 8. Done
    console.log();
    console.log(chalk.green.bold(`☯ Claude Code is now in ${nativeName}`));
    console.log();
    console.log(chalk.dim('   cc-i18n status        — check patch status'));
    console.log(chalk.dim('   cc-i18n unpatch        — restore English'));
    console.log(chalk.dim('   cc-i18n patch --reset  — choose a different language'));
  } catch (err) {
    spinner.fail(`Patch failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function interactiveLocaleSelect(): Promise<string> {
  const detection = detectSystemLanguage();
  const groups = await listLocaleGroups();

  if (detection.locale) {
    const group = groups.find(g => g.baseLocale === detection.locale);
    if (group && group.variants.length > 0) {
      const sourceHint = detection.source === 'env'
        ? `LANG=${detection.raw}`
        : `timezone=${detection.raw}`;

      console.log();
      console.log(chalk.cyan(`☯ Detected: ${group.nativeName} (${group.baseLocale})`) + chalk.dim(` — ${sourceHint}`));
      console.log();

      const choices = [
        ...group.variants
          .sort((a, b) => (a.variant === 'recommended' ? -1 : 1) - (b.variant === 'recommended' ? -1 : 1))
          .map(v => ({
            name: v.variant === 'recommended'
              ? `✅ Recommended — simple & friendly`
              : `🔧 Technical — professional terms`,
            value: v.key,
          })),
        { name: '🌐 Choose a different language...', value: '__other__' },
      ];

      const selected = await select({
        message: 'Which style?',
        choices,
        default: choices[0].value,
      });

      if (selected !== '__other__') return selected;
    }
  }

  // Full language selection
  console.log();
  const allChoices = groups
    .filter(g => g.variants.some(v => v.variant === 'recommended'))
    .map(g => ({
      name: `${g.nativeName} (${g.baseLocale})`,
      value: g.baseLocale,
    }));

  if (allChoices.length === 0) {
    throw new Error('No translation files found. Run "cc-i18n list" to check.');
  }

  const selectedLocale = await select({
    message: 'Choose a language:',
    choices: allChoices,
  });

  // Then ask variant
  const group = groups.find(g => g.baseLocale === selectedLocale);
  if (group && group.variants.length > 1) {
    const variantChoices = group.variants
      .sort((a, b) => (a.variant === 'recommended' ? -1 : 1) - (b.variant === 'recommended' ? -1 : 1))
      .map(v => ({
        name: v.variant === 'recommended'
          ? `✅ Recommended — simple & friendly`
          : `🔧 Technical — professional terms`,
        value: v.key,
      }));

    return select({
      message: 'Which style?',
      choices: variantChoices,
      default: variantChoices[0].value,
    });
  }

  return selectedLocale;
}
