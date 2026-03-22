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
  originalMd5: string;
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
      // ── Image in clipboard: template literal ──
      {
        search: '`Image in clipboard · ${Ty1.displayText} to paste`',
        replace: '`剪貼簿有圖片 · ${Ty1.displayText} 貼上`',
      },
      // ── Searching for: template literal ──
      {
        search: '`Searching for ${q}`',
        replace: '`搜尋 ${q}`',
      },
      // ── (A to expand): template literal ──
      {
        search: '`(${A} to expand)`',
        replace: '`(${A} 展開)`',
      },
      // ── Thinking (j to expand): template literal ──
      {
        search: '`${"∴ Thinking"} (${j} to expand)`',
        replace: '`${"∴ 思考中"} (${j} 展開)`',
      },
      // ── Effort level descriptions (HC3 function) ──
      {
        search: 'case"low":return"Quick, straightforward implementation with minimal overhead"',
        replace: 'case"low":return"low（低）— 快速直接，最少開銷"',
      },
      {
        search: 'case"medium":return"Balanced approach with standard implementation and testing"',
        replace: 'case"medium":return"medium（中等）— 均衡的實作與測試"',
      },
      {
        search: 'case"high":return"Comprehensive implementation with extensive testing and documentation"',
        replace: 'case"high":return"high（高）— 完整實作、全面測試與文件"',
      },
      {
        search: 'case"max":return"Maximum capability with deepest reasoning (Opus 4.6 only)"',
        replace: 'case"max":return"max（最高）— 最深度推理（僅 Opus 4.6）"',
      },
      {
        search: 'return"Balanced approach with standard implementation and testing"',
        replace: 'return"medium（中等）— 均衡的實作與測試"',
      },
      // ── Reading/Writing template literals ──
      {
        search: '`Reading ${q}`',
        replace: '`讀取 ${q}`',
      },
      {
        search: '`Writing ${q}`',
        replace: '`寫入 ${q}`',
      },
      // ── "to expand" in createElement (variable keybinding) ──
      {
        search: '," to expand)"',
        replace: '," 展開)"',
      },
      {
        search: '"Read output ("',
        replace: '"讀取輸出 ("',
      },
      // ── Template literal: thought for Ns ──
      {
        search: '`thought for ${Math.max(1,Math.round(G/1000))}s`',
        replace: '`思考了 ${Math.max(1,Math.round(G/1000))}s`',
      },
      // ── Template literal: +N lines ──
      {
        search: '`+${X} lines`',
        replace: '`+${X} 行`',
      },
      {
        search: '+${q} lines]`',
        replace: '+${q} 行]`',
      },
      {
        search: '+${H} lines ',
        replace: '+${H} 行 ',
      },
      {
        search: '+${j} lines',
        replace: '+${j} 行',
      },
      // ── Template literal: ↑↓ more files ──
      {
        search: '` ↑ ${w} more file${w!==1?"s":""}`',
        replace: '` ↑ 還有 ${w} 個檔案`',
      },
      {
        search: '` ↓ ${K.length-O} more file${K.length-O!==1?"s":""}`',
        replace: '` ↓ 還有 ${K.length-O} 個檔案`',
      },
      // ── Template literal: still running ──
      {
        search: '` · ${O} still running `',
        replace: '` · ${O} 仍在執行 `',
      },
      // ── Template literal: model set to ──
      {
        search: '` · model set to ${Dk}`',
        replace: '` · 模型設為 ${Dk}`',
      },
      // ── Template literal: already installed ──
      {
        search: '` · ${z6.installedCount} already installed`',
        replace: '` · ${z6.installedCount} 已安裝`',
      },
      // ── Template literal: collapse/show all ──
      {
        search: '` · ${_} to ${K?"collapse":"show all"}`',
        replace: '` · ${_} ${K?"收合":"展開全部"}`',
      },
      // ── Template literal: to scroll ──
      {
        search: '` · ${w}/${O} to scroll`',
        replace: '` · ${w}/${O} 捲動`',
      },
      // ── Template literal: ctrl+e to hide/explain ──
      {
        search: '` · ctrl+e to ${J.visible?"hide":"explain"}`',
        replace: '` · ctrl+e ${J.visible?"隱藏":"解說"}`',
      },
      // ── Template literal: Share earn ──
      {
        search: '`Share Claude Code and earn ${K86(K)} of extra usage · /passes`',
        replace: '`分享 Claude Code 可獲得 ${K86(K)} 額外用量 · /passes`',
      },
      // ── Template literal: free guest passes ──
      {
        search: '`You have free guest passes to share · ${q("/passes")}`',
        replace: '`你有免費邀請碼可以分享 · ${q("/passes")}`',
      },
      // ── Template literal: Tip access ──
      {
        search: '`Tip: You have access to ${q.name} with ${q.multiplier}x more context`',
        replace: '`提示：你可使用 ${q.name}，擁有 ${q.multiplier} 倍的上下文`',
      },
      // ── Template literal: Tip dynamic ──
      {
        search: '`Tip: ${j6}`',
        replace: '`提示：${j6}`',
      },
      // ── Template literal: Editing ──
      {
        search: '`Editing ${q}`',
        replace: '`編輯 ${q}`',
      },
      // ── Template literal: auto-compact ──
      {
        search: '`${M}% until auto-compact`',
        replace: '`${M}% 即將自動壓縮`',
      },
      // ── Template literal: carried from compact ──
      {
        search: '` (${K} carried from compact boundary)`',
        replace: '` (${K} 從壓縮邊界帶入)`',
      },
      // ── Template literal: In/Out tokens ──
      {
        search: '`  In: ${vq($.inputTokens)} · Out: ${vq($.outputTokens)}`',
        replace: '`  輸入: ${vq($.inputTokens)} · 輸出: ${vq($.outputTokens)}`',
      },
      // ── Template literal: per Mtok ──
      {
        search: '`${ct7(A.inputTokens)}/${ct7(A.outputTokens)} per Mtok`',
        replace: '`${ct7(A.inputTokens)}/${ct7(A.outputTokens)} / 百萬 token`',
      },
      // ── Ternary: will not work / may conflict ──
      {
        search: '"will not work":"may conflict"',
        replace: '"無法運作":"可能衝突"',
      },
      // ── Template literal: Branched conversation ──
      {
        search: '`Branched conversation${P}. You are now in the branch.${W}`',
        replace: '`已建立對話分支${P}。你現在在分支中。${W}`',
      },
      {
        search: '`Branched conversation${P}. Resume with: /resume ${_}`',
        replace: '`已建立對話分支${P}。恢復請用：/resume ${_}`',
      },
      // ── Running command: fixed string + template ──
      {
        search: 'return"Running command"',
        replace: 'return"執行指令"',
      },
      {
        search: '`Running ${A.description??J3(A.command,nI)}`',
        replace: '`執行 ${A.description??J3(A.command,nI)}`',
      },
      // ── Template literal: Next task ──
      {
        search: '`Next: ${B.subject}`',
        replace: '`下一個：${B.subject}`',
      },
      // ── Share: variant without /passes ──
      {
        search: '`Share Claude Code and earn ${K86(A)} of extra usage`',
        replace: '`分享 Claude Code 可獲得 ${K86(A)} 額外用量`',
      },
      // ── Share: variant with q() wrapper ──
      {
        search: '`Share Claude Code and earn ${q(K86(K))} of extra usage · ${q("/passes")}`',
        replace: '`分享 Claude Code 可獲得 ${q(K86(K))} 額外用量 · ${q("/passes")}`',
      },
      // ── Share: fallback text ──
      {
        search: '"Share Claude Code with friends"',
        replace: '"與朋友分享 Claude Code"',
      },
      // ── Branched conversation: default return ──
      {
        search: 'return"Branched conversation"',
        replace: 'return"已建立對話分支"',
      },
      // ── Tool badge: Wrote N lines to (createElement split) ──
      {
        search: '"Wrote ",H," lines to"',
        replace: '"寫入 ",H," 行至"',
      },
      {
        search: '"Wrote ",FK.createElement(v,{bold:!0},H)," lines to"',
        replace: '"寫入 ",FK.createElement(v,{bold:!0},H)," 行至"',
      },
      // ── Tool badge: Selected N lines from file in IDE ──
      {
        search: '"lines from ",L7.default.createElement(v,{bold:!0},A.displayPath)," in"," ",A.ideName',
        replace: '"行，來自 ",L7.default.createElement(v,{bold:!0},A.displayPath),"，在 ",A.ideName',
      },
      // ── Permission dialog: Accept button (unsafe string, needs postPatch) ──
      {
        search: '" Accept  "',
        replace: '" 允許  "',
      },
      // ── Permission dialog: Deny tab title (unsafe string, needs postPatch) ──
      {
        search: 'title:"Deny"',
        replace: 'title:"拒絕"',
      },
      // ── Fast mode overloaded: template literal variant ──
      {
        search: '`Fast mode overloaded and is temporarily unavailable · resets in ${q}`',
        replace: '`快速模式超載，暫時無法使用 · ${q} 後重置`',
      },
      // ── Settings section: Directories (too many non-UI occurrences) ──
      {
        search: '" Directories "',
        replace: '" 目錄 "',
      },
      // ── Tool header: Read userFacingName (1 occ, safe) ──
      {
        search: 'return"Read"}function',
        replace: 'return"讀取"}function',
      },
      // ── Tool header: Bash userFacingName (2 occ, both UI) ──
      {
        search: 'return"Bash"',
        replace: 'return"終端指令"',
      },
      // ── Tool header: Edit file title (2 occ, both UI) ──
      {
        search: '"Edit file"',
        replace: '"編輯檔案"',
      },
      // ── Tool badge: Reading/Read ternaries ──
      {
        search: '?"Reading":"reading"',
        replace: '?"正在讀取":"正在讀取"',
      },
      {
        search: '?"Read":"read"',
        replace: '?"已讀取":"已讀取"',
      },
      // ── Plural: file/files (all variable forms) ──
      {
        search: '===1?"file":"files"',
        replace: '===1?"個檔案":"個檔案"',
      },
      // ── Plural: commit/commits ──
      {
        search: '===1?"commit":"commits"',
        replace: '===1?"個提交":"個提交"',
      },
      // ── Plural: occurrence/occurrences ──
      {
        search: '===1?"occurrence":"occurrences"',
        replace: '===1?"個結果":"個結果"',
      },
      // ── Plural: issue/issues ──
      {
        search: '===1?"issue":"issues"',
        replace: '===1?"個問題":"個問題"',
      },
      // ── uncommitted (before file/commit count) ──
      {
        search: ' uncommitted ${',
        replace: ' 未提交 ${',
      },
      // ── Tool badge: Searching/Searched ternaries ──
      {
        search: '?"Searching for":"searching for"',
        replace: '?"正在搜尋":"正在搜尋"',
      },
      {
        search: '?"Searched for":"searched for"',
        replace: '?"已搜尋":"已搜尋"',
      },
      // ── Tool badge: pattern/patterns ──
      {
        search: '${A===1?"pattern":"patterns"}',
        replace: '${A===1?"個模式":"個模式"}',
      },
      {
        search: 'L===1?"pattern":"patterns"',
        replace: 'L===1?"個模式":"個模式"',
      },
      // ── Spinner: thinking label ──
      {
        search: '?`thinking${f}`',
        replace: '?`思考中${f}`',
      },
      // ── Tip: /mobile ──
      {
        search: '"/mobile to use Claude Code from the Claude app on your phone"',
        replace: '"/mobile 從手機上的 Claude App 使用 Claude Code"',
      },
      // ── Collapse: ternary (translation map already replaced "→ to expand" → "→ 展開") ──
      {
        search: 'Gq?"← to collapse":"→ 展開"',
        replace: 'Gq?"← 收合":"→ 展開"',
      },
      {
        search: 'return"← to collapse"',
        replace: 'return"← 收合"',
      },
      // ── Diff summary: removed (dimColor) ──
      {
        search: 'l7.createElement(v,{dimColor:d},"removed")',
        replace: 'l7.createElement(v,{dimColor:d},"已刪除")',
      },
      // ── Tool header: Write userFacingName ──
      {
        search: 'return"Write"}function',
        replace: 'return"寫入"}function',
      },
      // ── Diff summary: Added N lines/line ──
      {
        search: '"Added ",pY.createElement(v,{bold:!0},j)," ",j>1?"lines":"line"',
        replace: '"新增 ",pY.createElement(v,{bold:!0},j)," ",j>1?"行":"行"',
      },
      // ── Done status: ternary (完成/無輸出) ──
      {
        search: '?"Done":"',
        replace: '?"完成":"',
      },
      // ── Done status: background task return ──
      {
        search: 'return"Done"}',
        replace: 'return"完成"}',
      },
      // ── Done status: skill loaded ──
      {
        search: 'createElement(S1,null,["Done"])',
        replace: 'createElement(S1,null,["完成"])',
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
      // ── Image in clipboard: template literal ──
      {
        search: '`Image in clipboard · ${Ty1.displayText} to paste`',
        replace: '`剪贴板有图片 · ${Ty1.displayText} 粘贴`',
      },
      // ── Searching for: template literal ──
      {
        search: '`Searching for ${q}`',
        replace: '`搜索 ${q}`',
      },
      // ── (A to expand): template literal ──
      {
        search: '`(${A} to expand)`',
        replace: '`(${A} 展开)`',
      },
      // ── Thinking (j to expand): template literal ──
      {
        search: '`${"∴ Thinking"} (${j} to expand)`',
        replace: '`${"∴ 思考中"} (${j} 展开)`',
      },
      // ── Effort level descriptions (HC3 function) ──
      {
        search: 'case"low":return"Quick, straightforward implementation with minimal overhead"',
        replace: 'case"low":return"low（低）— 快速直接，最少开销"',
      },
      {
        search: 'case"medium":return"Balanced approach with standard implementation and testing"',
        replace: 'case"medium":return"medium（中等）— 均衡的实现与测试"',
      },
      {
        search: 'case"high":return"Comprehensive implementation with extensive testing and documentation"',
        replace: 'case"high":return"high（高）— 完整实现、全面测试与文档"',
      },
      {
        search: 'case"max":return"Maximum capability with deepest reasoning (Opus 4.6 only)"',
        replace: 'case"max":return"max（最高）— 最深度推理（仅 Opus 4.6）"',
      },
      {
        search: 'return"Balanced approach with standard implementation and testing"',
        replace: 'return"medium（中等）— 均衡的实现与测试"',
      },
      // ── Reading/Writing template literals ──
      {
        search: '`Reading ${q}`',
        replace: '`读取 ${q}`',
      },
      {
        search: '`Writing ${q}`',
        replace: '`写入 ${q}`',
      },
      // ── "to expand" in createElement (variable keybinding) ──
      {
        search: '," to expand)"',
        replace: '," 展开)"',
      },
      {
        search: '"Read output ("',
        replace: '"读取输出 ("',
      },
      // ── Template literal: thought for Ns ──
      {
        search: '`thought for ${Math.max(1,Math.round(G/1000))}s`',
        replace: '`思考了 ${Math.max(1,Math.round(G/1000))}s`',
      },
      // ── Template literal: +N lines ──
      {
        search: '`+${X} lines`',
        replace: '`+${X} 行`',
      },
      {
        search: '+${q} lines]`',
        replace: '+${q} 行]`',
      },
      {
        search: '+${H} lines ',
        replace: '+${H} 行 ',
      },
      {
        search: '+${j} lines',
        replace: '+${j} 行',
      },
      // ── Template literal: ↑↓ more files ──
      {
        search: '` ↑ ${w} more file${w!==1?"s":""}`',
        replace: '` ↑ 还有 ${w} 个文件`',
      },
      {
        search: '` ↓ ${K.length-O} more file${K.length-O!==1?"s":""}`',
        replace: '` ↓ 还有 ${K.length-O} 个文件`',
      },
      // ── Template literal: still running ──
      {
        search: '` · ${O} still running `',
        replace: '` · ${O} 仍在执行 `',
      },
      // ── Template literal: model set to ──
      {
        search: '` · model set to ${Dk}`',
        replace: '` · 模型设为 ${Dk}`',
      },
      // ── Template literal: already installed ──
      {
        search: '` · ${z6.installedCount} already installed`',
        replace: '` · ${z6.installedCount} 已安装`',
      },
      // ── Template literal: collapse/show all ──
      {
        search: '` · ${_} to ${K?"collapse":"show all"}`',
        replace: '` · ${_} ${K?"收起":"展开全部"}`',
      },
      // ── Template literal: to scroll ──
      {
        search: '` · ${w}/${O} to scroll`',
        replace: '` · ${w}/${O} 滚动`',
      },
      // ── Template literal: ctrl+e to hide/explain ──
      {
        search: '` · ctrl+e to ${J.visible?"hide":"explain"}`',
        replace: '` · ctrl+e ${J.visible?"隐藏":"解释"}`',
      },
      // ── Template literal: Share earn ──
      {
        search: '`Share Claude Code and earn ${K86(K)} of extra usage · /passes`',
        replace: '`分享 Claude Code 可获得 ${K86(K)} 额外用量 · /passes`',
      },
      // ── Template literal: free guest passes ──
      {
        search: '`You have free guest passes to share · ${q("/passes")}`',
        replace: '`你有免费邀请码可以分享 · ${q("/passes")}`',
      },
      // ── Template literal: Tip access ──
      {
        search: '`Tip: You have access to ${q.name} with ${q.multiplier}x more context`',
        replace: '`提示：你可使用 ${q.name}，拥有 ${q.multiplier} 倍的上下文`',
      },
      // ── Template literal: Tip dynamic ──
      {
        search: '`Tip: ${j6}`',
        replace: '`提示：${j6}`',
      },
      // ── Template literal: Editing ──
      {
        search: '`Editing ${q}`',
        replace: '`编辑 ${q}`',
      },
      // ── Template literal: auto-compact ──
      {
        search: '`${M}% until auto-compact`',
        replace: '`${M}% 即将自动压缩`',
      },
      // ── Template literal: carried from compact ──
      {
        search: '` (${K} carried from compact boundary)`',
        replace: '` (${K} 从压缩边界带入)`',
      },
      // ── Template literal: In/Out tokens ──
      {
        search: '`  In: ${vq($.inputTokens)} · Out: ${vq($.outputTokens)}`',
        replace: '`  输入: ${vq($.inputTokens)} · 输出: ${vq($.outputTokens)}`',
      },
      // ── Template literal: per Mtok ──
      {
        search: '`${ct7(A.inputTokens)}/${ct7(A.outputTokens)} per Mtok`',
        replace: '`${ct7(A.inputTokens)}/${ct7(A.outputTokens)} / 百万 token`',
      },
      // ── Ternary: will not work / may conflict ──
      {
        search: '"will not work":"may conflict"',
        replace: '"无法运作":"可能冲突"',
      },
      // ── Template literal: Branched conversation ──
      {
        search: '`Branched conversation${P}. You are now in the branch.${W}`',
        replace: '`已建立对话分支${P}。你现在在分支中。${W}`',
      },
      {
        search: '`Branched conversation${P}. Resume with: /resume ${_}`',
        replace: '`已建立对话分支${P}。恢复请用：/resume ${_}`',
      },
      // ── Running command: fixed string + template ──
      {
        search: 'return"Running command"',
        replace: 'return"执行指令"',
      },
      {
        search: '`Running ${A.description??J3(A.command,nI)}`',
        replace: '`执行 ${A.description??J3(A.command,nI)}`',
      },
      // ── Template literal: Next task ──
      {
        search: '`Next: ${B.subject}`',
        replace: '`下一个：${B.subject}`',
      },
      // ── Share: variant without /passes ──
      {
        search: '`Share Claude Code and earn ${K86(A)} of extra usage`',
        replace: '`分享 Claude Code 可获得 ${K86(A)} 额外用量`',
      },
      // ── Share: variant with q() wrapper ──
      {
        search: '`Share Claude Code and earn ${q(K86(K))} of extra usage · ${q("/passes")}`',
        replace: '`分享 Claude Code 可获得 ${q(K86(K))} 额外用量 · ${q("/passes")}`',
      },
      // ── Share: fallback text ──
      {
        search: '"Share Claude Code with friends"',
        replace: '"与朋友分享 Claude Code"',
      },
      // ── Branched conversation: default return ──
      {
        search: 'return"Branched conversation"',
        replace: 'return"已建立对话分支"',
      },
      // ── Tool badge: Reading/Read ternaries ──
      {
        search: '?"Reading":"reading"',
        replace: '?"正在读取":"正在读取"',
      },
      {
        search: '?"Read":"read"',
        replace: '?"已读取":"已读取"',
      },
      // ── Plural: file/files (all variable forms) ──
      {
        search: '===1?"file":"files"',
        replace: '===1?"个文件":"个文件"',
      },
      // ── Plural: commit/commits ──
      {
        search: '===1?"commit":"commits"',
        replace: '===1?"个提交":"个提交"',
      },
      // ── Plural: occurrence/occurrences ──
      {
        search: '===1?"occurrence":"occurrences"',
        replace: '===1?"个结果":"个结果"',
      },
      // ── Plural: issue/issues ──
      {
        search: '===1?"issue":"issues"',
        replace: '===1?"个问题":"个问题"',
      },
      // ── uncommitted (before file/commit count) ──
      {
        search: ' uncommitted ${',
        replace: ' 未提交 ${',
      },
      // ── Tool badge: Searching/Searched ternaries ──
      {
        search: '?"Searching for":"searching for"',
        replace: '?"正在搜索":"正在搜索"',
      },
      {
        search: '?"Searched for":"searched for"',
        replace: '?"已搜索":"已搜索"',
      },
      // ── Tool badge: pattern/patterns ──
      {
        search: '${A===1?"pattern":"patterns"}',
        replace: '${A===1?"个模式":"个模式"}',
      },
      {
        search: 'L===1?"pattern":"patterns"',
        replace: 'L===1?"个模式":"个模式"',
      },
      // ── Spinner: thinking label ──
      {
        search: '?`thinking${f}`',
        replace: '?`思考中${f}`',
      },
      // ── Tip: /mobile ──
      {
        search: '"/mobile to use Claude Code from the Claude app on your phone"',
        replace: '"/mobile 从手机上的 Claude App 使用 Claude Code"',
      },
      // ── Collapse: ternary (translation map already replaced "→ to expand" → "→ 展开") ──
      {
        search: 'Gq?"← to collapse":"→ 展开"',
        replace: 'Gq?"← 收起":"→ 展开"',
      },
      {
        search: 'return"← to collapse"',
        replace: 'return"← 收起"',
      },
      // ── Diff summary: removed (dimColor) ──
      {
        search: 'l7.createElement(v,{dimColor:d},"removed")',
        replace: 'l7.createElement(v,{dimColor:d},"已删除")',
      },
      // ── Tool header: Write userFacingName ──
      {
        search: 'return"Write"}function',
        replace: 'return"写入"}function',
      },
      // ── Diff summary: Added N lines/line ──
      {
        search: '"Added ",pY.createElement(v,{bold:!0},j)," ",j>1?"lines":"line"',
        replace: '"新增 ",pY.createElement(v,{bold:!0},j)," ",j>1?"行":"行"',
      },
      // ── Done status: ternary ──
      {
        search: '?"Done":"',
        replace: '?"完成":"',
      },
      // ── Done status: background return ──
      {
        search: 'return"Done"}',
        replace: 'return"完成"}',
      },
      // ── Done status: skill loaded ──
      {
        search: 'createElement(S1,null,["Done"])',
        replace: 'createElement(S1,null,["完成"])',
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
  // Step 1: Capture original MD5 before any modification
  const originalMd5 = getCliMd5(cliPath);

  // Step 2: Backup
  await createBackup(cliPath);

  // Step 3: Read source
  let source = await fs.readFile(cliPath, 'utf-8');

  // Step 4: Build and sort replacements (longest original first)
  const entries = [...translationMap.entries()]
    .sort((a, b) => b[0].length - a[0].length);

  // Step 5: Replace with safety checks
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

  // Step 5b: Locale-aware post-patch replacements
  // These handle strings that can't be replaced via the translation map
  // (apostrophe-split strings, template literals, UI symbols)
  const postPatchApplied = applyPostPatch(source, locale);
  source = postPatchApplied.source;
  applied += postPatchApplied.count;

  // Step 6: Write patched file
  await fs.writeFile(cliPath, source, 'utf-8');

  // Step 7: Validate JS syntax
  const syntaxValid = await validateSyntax(cliPath);
  if (!syntaxValid) {
    await restoreBackup(cliPath);
    throw new Error(
      'Patched cli.js failed syntax validation (node --check). Original restored.\n' +
      'A translation likely contains characters that break JS syntax.'
    );
  }

  // Step 8: Verify unsafe strings were not accidentally replaced
  const integrityOk = await verifyUnsafeIntegrity(cliPath);
  if (!integrityOk) {
    await restoreBackup(cliPath);
    throw new Error(
      'Unsafe string integrity check failed — a protocol string was modified. Original restored.\n' +
      'This indicates a bug in the patcher. Please report it.'
    );
  }

  // Step 9: Save state
  await saveState({
    locale,
    variant,
    ccVersion,
    patchDate: new Date().toISOString(),
    cliPath,
    cliMd5: getCliMd5(cliPath),
    originalMd5,
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
