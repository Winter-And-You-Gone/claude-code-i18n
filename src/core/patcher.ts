import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createBackup, restoreBackup } from './backup.js';
import { getCliMd5 } from './backup.js';
import type { TranslationSchema } from '../translations/schema.js';

const STATE_DIR = path.join(os.homedir(), '.cc-i18n');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

/**
 * Strings that must NEVER be translated.
 * These English originals appear in non-UI contexts (HTTP headers, protocol
 * constants, enum values, platform commands, internal identifiers) where
 * non-ASCII characters cause runtime crashes ("key must be ascii string").
 *
 * Stability > coverage. Better to leave a UI string in English
 * than to crash Claude Code by translating a protocol string.
 */
const UNSAFE_STRINGS: ReadonlySet<string> = new Set([
  // ── Truly dangerous: confirmed non-UI occurrences ──
  'Accept',           // HTTP Accept header (9 occ, 7 in headers)
  'Default',          // Cookie SameSite, TLS config, file paths (11 occ)
  'Bypass',           // PowerShell -ExecutionPolicy Bypass
  'Allow',            // HTTP Access-Control-Allow-Origin header
  'Deny',             // AWS SDK DENY constant
  'Ask',              // Wolfram Language function name list
  'Auto',             // Yoga layout engine enum value
  'Plan',             // Internal agentType identifier

  // ── Conservative exclusions: scanner-flagged, kept for stability ──
  'Add Marketplace',
  'Install GitHub App',
  'Remote Control failed',
  'Location: ',       // HTTP Location header context
  'Source: ',         // Mixed UI/protocol context
  'Running ',         // Near shell exec context
]);

/**
 * Strings that should always be replaced via replaceAll, even when
 * they appear multiple times. These are confirmed UI-only strings
 * that contextAwareReplace might miss because they sit in data arrays
 * (no createElement/label context nearby).
 */
const WHITELIST_STRINGS: ReadonlySet<string> = new Set([
  // try_suggestions — in plain data arrays, no createElement context
  'fix lint errors',
  'fix typecheck errors',
  'how do I log an error?',
  'create a util logging.py that...',
  // spinner words with >1 occurrence (also appear in status contexts)
  'Processing',
  'Working',
  'Creating',
]);

export interface PatchState {
  locale: string;
  variant: string | null;
  ccVersion: string;
  patchDate: string;
  cliPath: string;
  cliMd5: string;
  replacements: number;
  missed: number;
  missedKeys: string[];
  unsafeSkipped?: number;
  contextSkipped?: number;
}

export interface PatchResult {
  applied: number;
  missed: string[];
  skipped: string[];
  contextSkipped: number;
  total: number;
}

/**
 * Count how many times `search` appears in `source`.
 */
function countOccurrences(source: string, search: string): number {
  let count = 0;
  let idx = source.indexOf(search);
  while (idx !== -1) {
    count++;
    idx = source.indexOf(search, idx + search.length);
  }
  return count;
}

/**
 * Check if a match position is within a UI rendering context.
 * Used for multi-occurrence strings to avoid replacing protocol/data strings.
 */
function isUIContext(source: string, matchIndex: number): boolean {
  const LOOKBACK = 300;
  const start = Math.max(0, matchIndex - LOOKBACK);
  const before = source.substring(start, matchIndex);

  // createElement within 300 chars = React UI rendering
  if (before.includes('createElement')) return true;

  // UI property immediately before: label:"X", title:"X", etc.
  if (/(?:label|title|shortTitle|description|message|placeholder|subtitle|question|footerText|welcomeMessage|leaderIdleText|guidance|notice):\s*$/.test(before)) return true;

  // Nullish coalescing fallback (display default value)
  if (/\?\?\s*$/.test(before)) return true;

  // Bold/dim/color UI rendering props in close proximity
  if (/(?:dimColor|bold|italic|color)\s*[:=]/.test(before.slice(-100))) return true;

  // Array of display strings (contains spaces, !, ?, or ellipsis = likely UI text)
  const arrayMatch = before.slice(-300).match(/\[\s*((?:"[^"]*"\s*,?\s*)+)$/);
  if (arrayMatch && /[!?\u2026\s]/.test(arrayMatch[1])) return true;

  // Ternary else branch: ?"otherString":"THIS" (display-conditional)
  if (/"\s*:\s*$/.test(before.slice(-20))) return true;

  // Ternary then branch: condition?"THIS"
  if (/\?\s*$/.test(before.slice(-5))) return true;

  // Variable assignment to display string: w="THIS" or V6='THIS'
  if (/[a-zA-Z0-9_$]\s*=\s*$/.test(before.slice(-20))) {
    // Only if it looks like a short variable (UI state), not a long property path
    const assignMatch = before.slice(-30).match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*$/);
    if (assignMatch && assignMatch[1].length <= 6) return true;
  }

  // Array literal start: ["text" — only with display-like context further back
  if (/\[\s*$/.test(before.slice(-5))) {
    const farBefore = before.slice(-500);
    if (/(?:createElement|label|title|description|message)/.test(farBefore)) return true;
  }

  return false;
}

/**
 * Context-aware replacement: only replaces within recognized UI contexts.
 * For multi-occurrence strings where blind replaceAll could hit protocol code.
 */
function contextAwareReplace(
  source: string,
  search: string,
  replace: string,
): { result: string; count: number; skipped: number } {
  let result = '';
  let lastEnd = 0;
  let count = 0;
  let skipped = 0;
  let idx = source.indexOf(search);

  while (idx !== -1) {
    if (isUIContext(source, idx)) {
      result += source.substring(lastEnd, idx) + replace;
      count++;
    } else {
      result += source.substring(lastEnd, idx) + search;
      skipped++;
    }
    lastEnd = idx + search.length;
    idx = source.indexOf(search, lastEnd);
  }

  result += source.substring(lastEnd);
  return { result, count, skipped };
}

/**
 * Replace all occurrences of a string (not regex-based, safe for special chars).
 */
function replaceAll(source: string, search: string, replace: string): string {
  let result = source;
  let idx = result.indexOf(search);
  while (idx !== -1) {
    result = result.substring(0, idx) + replace + result.substring(idx + search.length);
    idx = result.indexOf(search, idx + replace.length);
  }
  return result;
}

/**
 * Locale-specific post-patch replacements for strings that can't be handled
 * by the translation map (apostrophe-split strings, template literals, symbols).
 */
interface PostPatchRule {
  search: string;
  replace: string;
}

function getPostPatchRules(locale: string): PostPatchRule[] {
  const baseLang = locale.replace(/-technical$/, '');

  if (baseLang === 'zh-TW') {
    return [
      // ── Safety page: apostrophe-split "what's in this folder" ──
      {
        search: '"Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what","\'","s in this folder first."',
        replace: '"快速安全檢查：這是你建立或信任的專案嗎？（例如你自己的程式碼、知名開源專案、或團隊的工作）如果不是，請先看一下這個資料夾的內容。"',
      },
      // ── Safety page: apostrophe-split "Claude Code'll be able to" ──
      {
        search: '"Claude Code","\'","ll be able to read, edit, and execute files here."',
        replace: '"Claude Code 將可以讀取、編輯和執行這裡的檔案。"',
      },
      // ── Try prefix in template literal ──
      {
        search: 'return`Try "${eJ(K)}"`',
        replace: 'return`試試看 "${eJ(K)}"`',
      },
      // ── Spinner: ✻ symbol → ☯ ──
      {
        search: 'te="✻"',
        replace: 'te="☯"',
      },
      // ── Spinner frames: replace with taichi breathing sequence ──
      {
        search: '["·","✢","✳","✶","✻","✽"]',
        replace: '[" ","·","∘","○","☯","○","∘","·"]',
      },
      {
        search: '["·","✢","✳","✶","✻","*"]',
        replace: '[" ","·","∘","○","☯","○","∘","·"]',
      },
      {
        search: '["·","✢","*","✶","✻","✽"]',
        replace: '[" ","·","∘","○","☯","○","∘","·"]',
      },
      // ── ✻ icon in UI strings → ☯ ──
      {
        search: '"✻ "',
        replace: '"☯ "',
      },
      {
        search: '"[✻] [✻] [✻]"',
        replace: '"[☯] [☯] [☯]"',
      },
      {
        search: '"[✻]"',
        replace: '"[☯]"',
      },
      {
        search: '"✻"',
        replace: '"☯"',
      },
      // ── Remaining ✻ in compound strings ──
      {
        search: '"✻ Conversation compacted ("',
        replace: '"☯ 對話已壓縮（"',
      },
      {
        search: '" ✻"',
        replace: '" ☯"',
      },
      {
        search: '" ) CC ✻ ┊╱"',
        replace: '" ) CC ☯ ┊╱"',
      },
      {
        search: '`✻ [Claude Code]',
        replace: '`☯ [Claude Code]',
      },
    ];
  }

  if (baseLang === 'zh-CN') {
    return [
      {
        search: '"Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what","\'","s in this folder first."',
        replace: '"快速安全检查：这是你创建或信任的项目吗？（例如你自己的代码、知名开源项目、或团队的工作）如果不是，请先看一下这个文件夹的内容。"',
      },
      {
        search: '"Claude Code","\'","ll be able to read, edit, and execute files here."',
        replace: '"Claude Code 将可以读取、编辑和执行这里的文件。"',
      },
      {
        search: 'return`Try "${eJ(K)}"`',
        replace: 'return`试试看 "${eJ(K)}"`',
      },
      {
        search: 'te="✻"',
        replace: 'te="☯"',
      },
      {
        search: '["·","✢","✳","✶","✻","✽"]',
        replace: '[" ","·","∘","○","☯","○","∘","·"]',
      },
      {
        search: '["·","✢","✳","✶","✻","*"]',
        replace: '[" ","·","∘","○","☯","○","∘","·"]',
      },
      {
        search: '["·","✢","*","✶","✻","✽"]',
        replace: '[" ","·","∘","○","☯","○","∘","·"]',
      },
      {
        search: '"✻ "',
        replace: '"☯ "',
      },
      {
        search: '"[✻] [✻] [✻]"',
        replace: '"[☯] [☯] [☯]"',
      },
      {
        search: '"[✻]"',
        replace: '"[☯]"',
      },
      {
        search: '"✻"',
        replace: '"☯"',
      },
      {
        search: '" ✻"',
        replace: '" ☯"',
      },
      {
        search: '" ) CC ✻ ┊╱"',
        replace: '" ) CC ☯ ┊╱"',
      },
      {
        search: '`✻ [Claude Code]',
        replace: '`☯ [Claude Code]',
      },
    ];
  }

  // No post-patch rules for English or other locales
  return [];
}

function applyPostPatch(
  source: string,
  locale: string,
): { source: string; count: number } {
  const rules = getPostPatchRules(locale);
  let count = 0;

  for (const rule of rules) {
    if (source.includes(rule.search)) {
      source = replaceAll(source, rule.search, rule.replace);
      count++;
    }
  }

  return { source, count };
}

/**
 * Apply translation patch to Claude Code's cli.js.
 *
 * Strategy:
 * 1. UNSAFE_STRINGS are never replaced (protocol/data safety)
 * 2. Single-occurrence strings use replaceAll (safe, only one place)
 * 3. Multi-occurrence strings use context-aware replacement
 *    (only replaces within createElement/label/title/etc. contexts)
 * 4. Post-patch: syntax validation + unsafe string integrity check
 * 5. Auto-restore on any failure
 */
export async function applyPatch(
  cliPath: string,
  translationMap: Map<string, string>,
  ccVersion: string,
  locale: string,
  variant: string | null = null,
): Promise<PatchResult> {
  // Step 1: Backup
  await createBackup(cliPath);

  // Step 2: Read source
  let source = await fs.readFile(cliPath, 'utf-8');

  // Step 3: Build and sort replacements (longest original first)
  const entries = [...translationMap.entries()]
    .sort((a, b) => b[0].length - a[0].length);

  // Step 4: Replace with safety checks
  let applied = 0;
  const missed: string[] = [];
  const skipped: string[] = [];
  let totalContextSkipped = 0;

  for (const [original, translated] of entries) {
    if (original === translated) continue;

    // Skip unsafe strings
    if (UNSAFE_STRINGS.has(original)) {
      skipped.push(original);
      continue;
    }

    let replaced = false;

    // Count occurrences to decide strategy
    const doubleSearch = `"${original}"`;
    const singleSearch = `'${original}'`;
    const doubleCount = countOccurrences(source, doubleSearch);
    const singleCount = countOccurrences(source, singleSearch);
    const totalCount = doubleCount + singleCount;
    const forceReplace = WHITELIST_STRINGS.has(original);

    if (totalCount <= 1 || forceReplace) {
      // Single occurrence OR whitelisted: safe to replaceAll
      if (doubleCount > 0) {
        source = replaceAll(source, doubleSearch, `"${translated}"`);
        replaced = true;
      }
      if (singleCount > 0) {
        source = replaceAll(source, singleSearch, `'${translated}'`);
        replaced = true;
      }
    } else {
      // Multiple occurrences: context-aware replacement
      if (doubleCount > 0) {
        const r = contextAwareReplace(source, doubleSearch, `"${translated}"`);
        source = r.result;
        if (r.count > 0) replaced = true;
        totalContextSkipped += r.skipped;
      }
      if (singleCount > 0) {
        const r = contextAwareReplace(source, singleSearch, `'${translated}'`);
        source = r.result;
        if (r.count > 0) replaced = true;
        totalContextSkipped += r.skipped;
      }
    }

    // Bare text fallback for JSX/createElement content
    if (!replaced && original.includes(' ')) {
      const bareSearch = `,${JSON.stringify(original)})`;
      const bareReplace = `,${JSON.stringify(translated)})`;
      if (source.includes(bareSearch)) {
        source = replaceAll(source, bareSearch, bareReplace);
        replaced = true;
      }
    }

    if (replaced) {
      applied++;
    } else {
      missed.push(original);
    }
  }

  // Step 4b: Locale-aware post-patch replacements
  // These handle strings that can't be replaced via the translation map
  // (apostrophe-split strings, template literals, UI symbols)
  const postPatchApplied = applyPostPatch(source, locale);
  source = postPatchApplied.source;
  applied += postPatchApplied.count;

  // Step 5: Write patched file
  await fs.writeFile(cliPath, source, 'utf-8');

  // Step 6: Validate JS syntax
  const syntaxValid = await validateSyntax(cliPath);
  if (!syntaxValid) {
    await restoreBackup(cliPath);
    throw new Error(
      'Patched cli.js failed syntax validation (node --check). Original restored.\n' +
      'A translation likely contains characters that break JS syntax.'
    );
  }

  // Step 7: Verify unsafe strings were not accidentally replaced
  const integrityOk = await verifyUnsafeIntegrity(cliPath);
  if (!integrityOk) {
    await restoreBackup(cliPath);
    throw new Error(
      'Unsafe string integrity check failed — a protocol string was modified. Original restored.\n' +
      'This indicates a bug in the patcher. Please report it.'
    );
  }

  // Step 8: Save state
  await saveState({
    locale,
    variant,
    ccVersion,
    patchDate: new Date().toISOString(),
    cliPath,
    cliMd5: getCliMd5(cliPath),
    replacements: applied,
    missed: missed.length,
    missedKeys: missed.slice(0, 20),
    unsafeSkipped: skipped.length,
    contextSkipped: totalContextSkipped,
  });

  return { applied, missed, skipped, contextSkipped: totalContextSkipped, total: entries.length };
}

/**
 * Validate that cli.js is still valid JavaScript using node --check.
 */
async function validateSyntax(cliPath: string): Promise<boolean> {
  try {
    execSync(`node --check "${cliPath}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify that UNSAFE_STRINGS still appear in their original English form.
 * If any unsafe string was accidentally replaced, this catches it.
 */
async function verifyUnsafeIntegrity(cliPath: string): Promise<boolean> {
  const source = await fs.readFile(cliPath, 'utf-8');

  // Check a subset of critical protocol strings that MUST remain ASCII
  const criticalStrings = [
    '"Accept"',         // HTTP header
    '"Default"',        // Cookie/TLS
    '"Bypass"',         // PowerShell
    '"Allow"',          // CORS
  ];

  for (const s of criticalStrings) {
    if (!source.includes(s)) {
      return false;
    }
  }

  return true;
}

/**
 * Verify that translations were applied by checking the patched file.
 */
export async function verifyPatch(
  cliPath: string,
  translationMap: Map<string, string>
): Promise<{ applied: number; missed: string[] }> {
  const source = await fs.readFile(cliPath, 'utf-8');
  let applied = 0;
  const missed: string[] = [];

  for (const [original, translated] of translationMap.entries()) {
    if (original === translated) {
      applied++;
      continue;
    }

    if (UNSAFE_STRINGS.has(original)) {
      applied++; // Count as "handled" (intentionally skipped)
      continue;
    }

    const hasDouble = source.includes(`"${translated}"`);
    const hasSingle = source.includes(`'${translated}'`);
    const hasBare = source.includes(JSON.stringify(translated));

    if (hasDouble || hasSingle || hasBare) {
      applied++;
    } else {
      missed.push(original);
    }
  }

  return { applied, missed };
}

/**
 * Save patch state to ~/.cc-i18n/state.json.
 */
export async function saveState(state: PatchState): Promise<void> {
  await fs.ensureDir(STATE_DIR);
  await fs.writeJson(STATE_FILE, state, { spaces: 2 });
}

/**
 * Load patch state from ~/.cc-i18n/state.json.
 */
export async function loadState(): Promise<PatchState | null> {
  if (!await fs.pathExists(STATE_FILE)) {
    return null;
  }
  try {
    return await fs.readJson(STATE_FILE);
  } catch {
    return null;
  }
}

/**
 * Remove patch state file.
 */
export async function clearState(): Promise<void> {
  if (await fs.pathExists(STATE_FILE)) {
    await fs.remove(STATE_FILE);
  }
}

/**
 * Get the state directory path.
 */
export function getStateDir(): string {
  return STATE_DIR;
}
