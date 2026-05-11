# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`claude-code-i18n` is a Node 18+ TypeScript ESM CLI (`cc-i18n`) that localizes Claude Code by patching the installed Claude Code `cli.js` bundle. It does not call the Claude API; it finds the local Claude Code installation, backs up `cli.js`, replaces known UI strings with locale translations, applies locale-specific post-patch rules for minified/template-literal edge cases, validates syntax, and records patch state under `~/.cc-i18n/state.json`.

## Common commands

```bash
npm install              # install dependencies
npm run build            # bundle dist/cli.js with tsup and copy translations
npm run dev              # watch build
npm test                 # run Vitest tests once
npm run test:watch       # run Vitest in watch mode
npm run lint             # TypeScript type check
npm run prepublishOnly   # lint, test, and build
```

Run one test file with Vitest directly:

```bash
npx vitest run test/patcher.test.ts
npx vitest run test/patcher.test.ts -t "should replace strings"
```

After `npm run build`, exercise the CLI locally with:

```bash
node dist/cli.js --help
node dist/cli.js list
node dist/cli.js status
```

## Workflow rules

- Answer in Chinese by default unless the user explicitly asks for another language.
- After changing code, rebuild the project, create a local git commit, push it to GitHub, and include the build/commit/push status in the final report. Do not auto-commit or push documentation-only changes unless the user explicitly asks.
- If a network operation fails, retry through the local proxy on port 7890 (`http://127.0.0.1:7890` / `https://127.0.0.1:7890`) when the tool or command supports proxy configuration. If it still fails, report the network issue to the user.

## Architecture

- `src/cli.ts` is the Commander entry point. It wires subcommands such as `patch`, `unpatch`, `status`, `list`, `extract`, `contribute`, `check-update`, `scan`, and `install-wrapper`.
- `src/commands/` contains command orchestration and user interaction. `patch.ts` is the main flow: find Claude Code, resolve/select locale, load translations, apply the bundle patch, optionally patch HUD and installed skill descriptions, install the language rule plugin, then report results.
- `src/core/finder.ts` locates Claude Code across `which claude`, native installer paths, npm globals, Volta, and common platform paths. The patcher depends on this returning the real `cli.js` and package version.
- `src/core/backup.ts`, `src/core/patcher.ts`, and `src/core/watcher.ts` implement patch safety and state. `patcher.ts` restores from backup before re-patching, skips known unsafe protocol/internal strings, uses context-aware replacement for repeated UI strings, runs locale post-patch rules, injects response-language directives, validates with `node --check`, verifies critical ASCII strings remain intact, and saves state.
- `src/core/translations.ts` discovers translation JSON files and builds the English-original-to-localized-string map. It uses `en-technical.json` as the base for actual Claude Code bundle strings when present.
- `src/core/extractor.ts` and `src/core/validator.ts` support translation maintenance: extracting known/pattern-matched UI strings from `cli.js` and validating translation file completeness.
- `src/translations/` contains locale JSON files, technical variants, the template, skill-description translations, and `schema.ts`. Translation files are copied to `dist/translations/` by `tsup.config.ts` on build.
- `src/plugin/` contains the packaged Claude Code plugin assets, while `src/commands/plugin-installer.ts` writes the active language rule to `~/.claude/plugins/cc-i18n/CLAUDE.md`.
- `src/core/skill-patcher.ts` translates installed user/plugin skill and command descriptions under `~/.claude` by matching existing frontmatter descriptions against `skill-descriptions-<locale>.json`.
- `src/commands/install-wrapper.ts` installs a `~/.local/bin/claude` wrapper that checks the saved patch MD5 and auto-runs `cc-i18n patch --lang <locale>` when Claude Code updates.

## Important implementation constraints

- Patching edits the user's installed Claude Code bundle, not this repository's source. Keep safety checks conservative: preserve backups, avoid translating protocol/header/internal identifier strings, and validate patched JavaScript before saving successful state.
- `UNSAFE_STRINGS`, `WHITELIST_STRINGS`, and locale `getPostPatchRules()` in `src/core/patcher.ts` are central to stability across minified Claude Code releases. Prefer version-resilient regex rules for minified variable names when adding post-patch coverage.
- Translation maps are keyed by English originals from the base file, not by schema keys. When adding new strings, update the base English translation file and target locale files together, then run tests/typecheck.
- CLI integration tests in `test/cli.test.ts` execute `dist/cli.js`, so build before relying on those tests after source changes.
- Some commands intentionally touch user-global locations (`~/.cc-i18n`, `~/.claude`, installed Claude Code, `~/.local/bin`). Tests should use temporary fixtures where possible and avoid requiring a real Claude Code installation.

## Contribution notes from repository docs

- New locale templates are generated with `cc-i18n contribute --lang <locale>`.
- Translation strings should be concise for terminal UI, preserve trailing spaces and ellipsis characters, and not translate brand names such as Claude, Claude Code, or GitHub.
- To manually test a new locale after building: copy the locale JSON into `src/translations/`, run `npm run build`, run `cc-i18n patch --lang <locale>`, then verify `claude --version` still works.
