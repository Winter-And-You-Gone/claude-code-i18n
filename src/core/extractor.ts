import fs from 'fs-extra';

export interface ExtractedString {
  key: string;
  original: string;
  pattern: string;
  context: string;
  category: string;
  confidence: 'high' | 'medium';
}

/**
 * Known UI strings organized by category.
 * These are confirmed to exist in Claude Code's cli.js bundle.
 */
export const KNOWN_STRINGS: Record<string, Record<string, string>> = {
  permissions: {
    allow: 'Allow',
    deny: 'Deny',
    ask: 'Ask',
    yes_allow_external: 'Yes, allow external imports',
    no_disable_external: 'No, disable external imports',
    yes_trust_settings: 'Yes, I trust these settings',
    yes_for_session: 'Yes, for this session',
    yes_remember_dir: 'Yes, and remember this directory',
    yes_delete: 'Yes, delete',
    yes_during_session: 'Yes, during this session',
    yes_allow_all_edits_session: 'Yes, allow all edits during this session',
    yes_use_auto_mode: 'Yes, and use auto mode',
    yes_bypass_permissions: 'Yes, and bypass permissions',
    yes_auto_accept: 'Yes, auto-accept edits',
    yes_manually_approve: 'Yes, manually approve edits',
    yes_enter_plan_mode: 'Yes, enter plan mode',
    yes_use_recommended: 'Yes, use recommended settings',
    yes_trust_folder: 'Yes, I trust this folder',
    yes_accept: 'Yes, I accept',
    yes_enable_auto: 'Yes, enable auto mode',
    yes_make_default: 'Yes, and make it my default mode',
    no_exit: 'No, exit',
    no_cancel: 'No, cancel',
    no_keep_tag: 'No, keep tag',
    no_not_now: 'No, not now',
    no_go_back: 'No, go back',
    no_keep_planning: 'No, keep planning',
    no_start_implementing: 'No, start implementing now',
    no_exit_claude: 'No, exit Claude Code',
    no_tell_differently: 'No, and tell Claude what to do differently ',
    waiting_permission: 'Waiting for permission\u2026',
    do_you_proceed: 'Do you want to proceed?',
    no_code_changes_until_approve: 'No code changes will be made until you approve the plan.',
    allowed_by_auto: 'Allowed by auto mode classifier',
    settings_requiring_approval: 'Settings requiring approval:',
    allow_fetch_content: 'Do you want to allow Claude to fetch this content?',
    allow_connection: 'Do you want to allow this connection?',
    make_edit_to: 'Do you want to make this edit to',
    confirm_delete_agent: 'Are you sure you want to delete the agent',
    yes_allow_all_edits_in: 'Yes, allow all edits in ',
    yes_allow_reading_from: 'Yes, allow reading from ',
  },

  modes: {
    default_mode: 'Default',
    plan_mode: 'Plan Mode',
    plan_short: 'Plan',
    accept_edits: 'Accept edits',
    accept_short: 'Accept',
    bypass_permissions: 'Bypass Permissions',
    bypass_short: 'Bypass',
    dont_ask: "Don't Ask",
    dont_ask_short: 'DontAsk',
    auto_mode: 'Auto mode',
    auto_short: 'Auto',
    default_recommended: 'Default (recommended)',
    default_permission_mode: 'Default permission mode',
    thinking_mode: 'Thinking mode',
  },

  status: {
    thinking: '\u273b Thinking\u2026',
    compacting: 'Compacting conversation\u2026',
    running: 'Running\u2026 ',
    running_alt: 'Running ',
    connecting: 'connecting\u2026',
    loading: 'Loading\u2026',
    loading_conversations: ' Loading conversations\u2026',
    loading_session: 'Loading session\u2026',
    loading_stats: ' Loading stats\u2026',
    loading_your_stats: ' Loading your Claude Code stats\u2026',
    loading_diff: 'Loading diff\u2026',
    loading_explanation: 'Loading explanation\u2026',
    loading_output: 'Loading output\u2026',
    loading_plugins: 'Loading installed plugins\u2026',
    loading_usage: 'Loading usage data\u2026',
    loading_environments: 'Loading environments\u2026',
    searching: ' Searching\u2026',
    searching_claude: 'Searching with Claude\u2026',
    search: 'Search\u2026',
    resuming: ' Resuming conversation\u2026',
    resuming_session: 'Resuming session\u2026',
    initializing: 'Initializing\u2026',
    installing: 'Installing\u2026',
    processing: 'Processing\u2026',
    processing_auth: 'Processing authentication\u2026',
    processing_changes: 'Processing changes\u2026',
    updating: 'Updating\u2026',
    auto_updating: 'Auto-updating\u2026',
    fetching: 'Fetching\u2026',
    saving_session: 'Saving session\u2026',
    summarizing: 'Summarizing\u2026',
    voice_processing: 'Voice: processing\u2026',
    please_wait: 'Please wait\u2026',
    pasting_text: 'Pasting text\u2026',
    teleporting: ' Teleporting session\u2026',
    interrupted: 'Interrupted ',
    task_running: 'Task is still running\u2026',
    summarized_conversation: 'Summarized conversation',
    no_changes_detected: 'No changes detected',
    debug_mode_enabled: 'Debug mode enabled',
    this_may_take_moment: 'This may take a moment.',
    this_may_take_moments: 'This may take a few moments.',
    ultraplanning: 'Ultraplanning\u2026',
    churning: 'Churning',
    computing: 'Computing',
    generating: 'Generating',
    working: 'Working',
    retrying: 'Retrying\u2026',
    waiting: 'Waiting\u2026',
    running_no_space: 'Running\u2026',
    compacting_no_ellipsis: 'Compacting conversation',
    searching_prefix: 'Searching: ',
    running_background: 'Running in the background',
    loading_cc_sessions: 'Loading Claude Code sessions\u2026',
    fetching_cc_sessions: 'Fetching your Claude Code sessions\u2026',
    loading_marketplaces: 'Loading marketplaces\u2026',
    loading_marketplaces_dots: 'Loading marketplaces...',
    loading_thinkback: 'Loading thinkback skill\u2026',
    generating_qr: 'Generating QR code\u2026',
    loading_guest_pass: 'Loading guest pass information\u2026',
    migrating_native: 'Migrating to native installation\u2026',
    pending_changes: 'Pending changes:',
    idle: 'Idle',
    running_feedback: 'Running feedback capture...',
    waiting_team_lead: 'Waiting for team lead approval',
    loading_output_styles: 'Loading output styles\u2026',
    validating_session: 'Validating session',
  },

  prompts: {
    press_enter_continue: 'Press Enter to continue',
    press_enter_verify: 'Press Enter when ready to verify\u2026',
    press_any_key_continue: 'Press any key to continue\u2026',
    press_any_key_exit: 'Press any key to exit',
    type_something: 'Type something\u2026',
    esc_go_back: 'Esc to go back',
    save_close_continue: 'Save and close editor to continue...',
    save_file_continue: 'Save file to continue\u2026',
    search_settings: 'Search settings...',
    review_answers: 'Review your answers',
  },

  tools: {
    view_tools: 'View tools',
    edit_file: 'Edit file',
    create_file: 'Create file',
  },

  errors: {
    file_not_found: 'File not found',
    error_reading_file: 'Error reading file',
    error_searching_files: 'Error searching files',
    installation_failed: 'Installation failed',
    verification_failed: 'Verification failed',
    no_network: 'No network connectivity. Check your internet connection.',
    remote_control_failed: 'Remote Control failed',
    no_clipboard_image: "No image found in clipboard. You're SSH'd; try scp?",
  },

  actions: {
    try_again: 'Try again',
    not_now: 'Not now',
    never_mind: 'Never mind',
    exit_fix_manually: 'Exit and fix manually',
    restore_conversation: 'Restore conversation',
    help_improve: 'Help improve Claude',
    clear_auth: 'Clear authentication',
    open_homepage: 'Open homepage',
    back_to_list: 'Back to plugin list',
    manage_marketplaces: 'Manage marketplaces',
    select_marketplace: 'Select marketplace',
    discover_plugins: 'Discover plugins',
    add_marketplace: 'Add Marketplace',
    install_github_app: 'Install GitHub App',
    save_to_file: 'Save to file',
    confirm_and_save: 'Confirm and save',
  },

  info: {
    version: 'Version: ',
    status_prefix: 'Status: ',
    command_prefix: 'Command: ',
    location: 'Location: ',
    config_location: 'Config location: ',
    tools_prefix: 'Tools: ',
    auth_prefix: 'Auth: ',
    url_prefix: 'URL: ',
    no_hooks_configured: 'No hooks configured for this event.',
    add_hooks_hint: 'To add hooks, edit settings.json directly or ask Claude.',
    no_matching_sessions: 'No matching sessions found.',
    no_conversations_found: 'No conversations found to resume.',
    no_scheduled_jobs: 'No scheduled jobs.',
    no_tasks_found: 'No tasks found',
    no_tasks_running: 'No tasks currently running',
    no_agents_found: 'No agents found.',
    no_skills_found: 'No skills found',
    no_stats_yet: 'No stats available yet. Start using Claude Code!',
    built_in_agents: 'Built-in agents',
    system_prompt: 'System prompt',
    suggestions: 'Suggestions ',
    plan_to_implement: 'Plan to implement',
    no_preview: 'No preview available',
    working_tree_clean: 'Working tree is clean',
    working_dir_changes: 'Working Directory Has Changes',
    showing_transcript: 'Showing detailed transcript \u00b7 ',
    no_plugins: 'No plugins available.',
    git_required: 'Git is required to install marketplaces.',
    environment_prefix: 'Environment: ',
    session_prefix: 'Session: ',
    source_prefix: 'Source: ',
    scope_prefix: 'Scope: ',
    type_prefix: 'Type: ',
    connected: 'Connected',
    disconnected: 'Disconnected',
    multiple_sessions_hint: 'Running multiple Claude sessions? Use /color and /rename to tell them apart at a glance.',
  },

  billing: {
    pro_max_team: 'Pro, Max, Team, or Enterprise',
    api_billing: 'API usage billing',
    third_party: 'Amazon Bedrock, Microsoft Foundry, or Vertex AI',
    using_third_party: 'Using 3rd-party platforms',
    configure_extra: 'Configure extra usage to keep working when limits are hit',
    high_demand_opus: 'We are experiencing high demand for Opus 4.',
  },

  models: {
    opus_1m: 'Opus (1M context)',
    sonnet_1m: 'Sonnet (1M context)',
  },

  startup: {
    welcome: 'Welcome to Claude Code',
    ready_to_code: 'Ready to code?',
    press_up_edit_queued: 'Press up to edit queued messages',
  },

  try_suggestions: {
    fix_lint: 'fix lint errors',
    fix_typecheck: 'fix typecheck errors',
    how_log_error: 'how do I log an error?',
    create_util: 'create a util logging.py that...',
  },

  goodbye: {
    goodbye: 'Goodbye!',
    see_ya: 'See ya!',
    bye: 'Bye!',
    catch_you_later: 'Catch you later!',
  },

  hints: {
    esc_cancel: 'Esc to cancel',
    enter_confirm_esc_cancel: 'Enter to confirm \u00b7 Esc to cancel',
    enter_copy_esc_cancel: 'Enter to copy link \u00b7 Esc to cancel',
    tab_enter_esc: 'Tab to toggle \u00b7 Enter to confirm \u00b7 Esc to cancel',
    enter_submit_esc_cancel: 'Enter to submit \u00b7 Esc to cancel',
    esc_close: 'Esc to close',
    esc_exit: 'Esc to exit',
    enter_continue: 'Enter to continue',
    enter_select_esc_continue: 'Enter to select \u00b7 Esc to continue',
    enter_view: 'Enter to view',
    enter_apply: 'Enter to apply',
  },

  plan: {
    here_is_plan: "Here is Claude's plan:",
    plan_saved: 'Plan saved!',
    plan_updated: 'Plan updated',
    plan_needs_revision: 'Plan needs revision',
  },
};

/**
 * Flatten KNOWN_STRINGS into a list of { key, original, category } entries.
 */
function flattenKnownStrings(): { key: string; original: string; category: string }[] {
  const result: { key: string; original: string; category: string }[] = [];
  for (const [category, strings] of Object.entries(KNOWN_STRINGS)) {
    for (const [key, original] of Object.entries(strings)) {
      result.push({ key: `${category}.${key}`, original, category });
    }
  }
  return result;
}

/**
 * Extract context around a match position in the source.
 */
function getContext(source: string, index: number, length: number, contextSize = 50): string {
  const start = Math.max(0, index - contextSize);
  const end = Math.min(source.length, index + length + contextSize);
  return source.substring(start, end).replace(/\n/g, '\\n');
}

/**
 * Step 1: Find known UI strings by exact match in the cli.js source.
 */
function extractKnownStrings(source: string): ExtractedString[] {
  const results: ExtractedString[] = [];
  const known = flattenKnownStrings();

  for (const { key, original, category } of known) {
    // Search for the string in both quote styles
    for (const quote of ['"', "'"]) {
      const pattern = `${quote}${original}${quote}`;
      const index = source.indexOf(pattern);
      if (index !== -1) {
        results.push({
          key,
          original,
          pattern,
          context: getContext(source, index, pattern.length),
          category,
          confidence: 'high',
        });
        break;
      }
    }

    // Also check without quotes (for JSX text content, template literals)
    if (!results.find(r => r.key === key)) {
      const index = source.indexOf(original);
      if (index !== -1) {
        results.push({
          key,
          original,
          pattern: original,
          context: getContext(source, index, original.length),
          category,
          confidence: 'high',
        });
      }
    }
  }

  return results;
}

/**
 * Step 2: Pattern-match for additional UI strings not in the known list.
 *
 * Looks for quoted strings that appear to be user-facing text:
 * - 3-80 characters
 * - Contains at least one space (phrases, not identifiers)
 * - Starts with uppercase (UI labels typically do)
 * - No URL/path characters
 * - Not all caps (constants)
 */
function extractPatternStrings(source: string, knownOriginals: Set<string>): ExtractedString[] {
  const results: ExtractedString[] = [];
  const seen = new Set<string>();

  // Match strings in createElement text content: ,"text")
  const uiTextPattern = /createElement\([^,]+,(?:\{[^}]*\}|null),\s*"([^"]{3,80})"\s*\)/g;
  let match;
  while ((match = uiTextPattern.exec(source)) !== null) {
    const text = match[1];
    if (isLikelyUIString(text) && !knownOriginals.has(text) && !seen.has(text)) {
      seen.add(text);
      results.push({
        key: `discovered.${toKey(text)}`,
        original: text,
        pattern: match[0].substring(0, 100),
        context: getContext(source, match.index, match[0].length),
        category: 'discovered',
        confidence: 'medium',
      });
    }
  }

  // Match label:"..." patterns (UI labels in component props)
  const labelPattern = /label:\s*"([^"]{3,80})"/g;
  while ((match = labelPattern.exec(source)) !== null) {
    const text = match[1];
    if (isLikelyUIString(text) && !knownOriginals.has(text) && !seen.has(text)) {
      seen.add(text);
      results.push({
        key: `discovered.${toKey(text)}`,
        original: text,
        pattern: match[0],
        context: getContext(source, match.index, match[0].length),
        category: 'discovered',
        confidence: 'medium',
      });
    }
  }

  // Match title:"..." patterns (tab/mode titles)
  const titlePattern = /title:\s*"([^"]{3,60})"/g;
  while ((match = titlePattern.exec(source)) !== null) {
    const text = match[1];
    if (isLikelyUIString(text) && !knownOriginals.has(text) && !seen.has(text)) {
      seen.add(text);
      results.push({
        key: `discovered.${toKey(text)}`,
        original: text,
        pattern: match[0],
        context: getContext(source, match.index, match[0].length),
        category: 'discovered',
        confidence: 'medium',
      });
    }
  }

  // Match placeholder:"..." patterns
  const placeholderPattern = /placeholder:\s*"([^"]{3,80})"/g;
  while ((match = placeholderPattern.exec(source)) !== null) {
    const text = match[1];
    if (isLikelyUIString(text) && !knownOriginals.has(text) && !seen.has(text)) {
      seen.add(text);
      results.push({
        key: `discovered.${toKey(text)}`,
        original: text,
        pattern: match[0],
        context: getContext(source, match.index, match[0].length),
        category: 'discovered',
        confidence: 'medium',
      });
    }
  }

  return results;
}

/**
 * Check if a string looks like user-facing UI text.
 */
function isLikelyUIString(s: string): boolean {
  // Must start with uppercase or emoji
  if (!/^[A-Z\u{1F000}-\u{1FFFF}\u2700-\u27BF\u2600-\u26FF\u2733]/u.test(s)) return false;

  // Must contain a space (phrases, not identifiers)
  if (!s.includes(' ')) return false;

  // Exclude URLs, paths, code-like strings
  if (/^https?:\/\//.test(s)) return false;
  if (s.includes('/') && s.split('/').length > 2) return false;
  if (/^[A-Z_]+$/.test(s)) return false; // ALL_CAPS constant
  if (s.includes('=') && s.includes('(')) return false; // code
  if (s.includes('${') || s.includes('`')) return false; // template literal
  if (/\.[a-z]{2,4}$/.test(s) && !s.endsWith('...') && !s.endsWith('\u2026')) return false; // file extensions

  return true;
}

/**
 * Convert a UI string to a safe key name.
 */
function toKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 40);
}

/**
 * Extract translatable UI strings from Claude Code's cli.js bundle.
 *
 * Two-step approach:
 * 1. Exact match against known UI strings (high confidence)
 * 2. Pattern matching for additional strings (medium confidence)
 *
 * @param cliPath - Path to the cli.js file
 * @returns Array of extracted strings with metadata
 */
export async function extractStrings(cliPath: string): Promise<ExtractedString[]> {
  const source = await fs.readFile(cliPath, 'utf-8');

  // Step 1: Known strings
  const knownResults = extractKnownStrings(source);

  // Build set of already-found originals for dedup
  const knownOriginals = new Set(knownResults.map(r => r.original));

  // Step 2: Pattern matching
  const patternResults = extractPatternStrings(source, knownOriginals);

  return [...knownResults, ...patternResults];
}

/**
 * Categorize extracted strings by UI area.
 */
export function categorizeStrings(
  strings: ExtractedString[]
): Record<string, ExtractedString[]> {
  const categories: Record<string, ExtractedString[]> = {};
  for (const s of strings) {
    if (!categories[s.category]) {
      categories[s.category] = [];
    }
    categories[s.category].push(s);
  }
  return categories;
}
