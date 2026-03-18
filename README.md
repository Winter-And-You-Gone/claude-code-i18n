# cc-i18n

**Internationalize Claude Code — Make the entire CLI interface available in any language**

> Claude Code's terminal UI is hardcoded in English. This tool changes that.

[![npm version](https://img.shields.io/npm/v/cc-i18n.svg)](https://www.npmjs.com/package/cc-i18n)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md)

---

## What it does

cc-i18n translates Claude Code's **entire terminal interface** into your language:

- Permission prompts (Allow / Deny / Always allow...)
- Status messages (Thinking... / Running... / Compacting...)
- Mode labels (Plan Mode / Auto-accept edits / Bypass...)
- Error messages, button labels, and more
- **Also makes Claude's AI responses use your language** via a plugin

### Kids Mode

A special "kids" variant uses the simplest possible words + emoji to explain everything:

| English | 繁體中文 | 小學生版 |
|---------|---------|---------|
| Allow | 允許 | 👍 好的 |
| Deny | 拒絕 | 🚫 不要 |
| Thinking... | 思考中... | 🤔 想一想... |
| Running... | 執行中... | ⚡ 在做了在做了... |
| Plan Mode | 規劃模式 | 📋 只看不做模式 |
| Bypass Permissions | 跳過權限 | ⚠️ 什麼都不問模式 |

---

## Quick Start

```bash
# Install
npm install -g cc-i18n

# Switch to Traditional Chinese
cc-i18n patch --lang zh-TW

# Switch to Kids mode
cc-i18n patch --lang zh-TW --kids

# Check status
cc-i18n status

# Restore English
cc-i18n unpatch
```

---

## Available Languages

| Locale | Language | Kids |
|--------|----------|------|
| `zh-TW` | 繁體中文 (Traditional Chinese) | ✅ |
| `zh-CN` | 简体中文 (Simplified Chinese) | ✅ |

More languages coming soon. [Contribute a translation!](#contributing-translations)

---

## Commands

### `cc-i18n patch --lang <locale>`

Apply translation patch to Claude Code.

```bash
cc-i18n patch --lang zh-TW          # Traditional Chinese
cc-i18n patch --lang zh-CN --kids   # Simplified Chinese, kids mode
```

What it does:
1. Finds your Claude Code installation
2. Backs up the original `cli.js`
3. Replaces English UI strings with translations
4. Validates the patched file (auto-restores on failure)
5. Installs a Claude plugin for AI response language

### `cc-i18n unpatch`

Restore Claude Code to original English.

### `cc-i18n status`

Show current patch status, language, version, and replacement count.

### `cc-i18n list`

List all available translation locales.

### `cc-i18n extract`

Extract UI strings from Claude Code for translation work.

```bash
cc-i18n extract --output strings.json
```

### `cc-i18n contribute --lang <locale>`

Generate an empty translation template for a new language.

```bash
cc-i18n contribute --lang ja   # Creates ja.json template
```

### `cc-i18n check-update`

Check if Claude Code was updated and re-apply patch if needed.

```bash
cc-i18n check-update              # Check and report
cc-i18n check-update --repatch    # Auto re-apply if updated
cc-i18n check-update --hook       # Print shell hook for .zshrc
```

---

## Auto Re-patch After Updates

Claude Code updates will overwrite the patched `cli.js`. Add this to your `.zshrc` or `.bashrc` to auto re-patch:

```bash
cc-i18n check-update --hook >> ~/.zshrc
source ~/.zshrc
```

---

## How It Works

### Two-Layer Architecture

| Layer | Translates | Method |
|-------|-----------|--------|
| **Patcher** | System UI: buttons, prompts, status bar | String replacement in `cli.js` |
| **Plugin** | AI content: responses, explanations | CLAUDE.md rules in `~/.claude/` |

### Safety

- **Backup**: Original `cli.js` is backed up before any modification
- **Validation**: Patched file is verified with `node --check`
- **Auto-restore**: If validation fails, the original is automatically restored
- **Reversible**: `cc-i18n unpatch` fully restores the original

---

## Contributing Translations

Adding a new language is straightforward:

### 1. Generate a template

```bash
cc-i18n contribute --lang ja
```

### 2. Fill in translations

Edit `ja.json` — reference `src/translations/en.json` for the English originals.

### 3. Translation guidelines

- **Standard version**: Use natural, professional terminology for your locale
- **Kids version** (optional): Simple words, short sentences, emoji, friendly tone
- Keep the same JSON structure — every key must be present
- Test with `cc-i18n patch --lang ja` before submitting

### 4. Submit a PR

Copy your translation to `src/translations/` and submit a pull request.

---

## Technical Details

- **Claude Code internals**: TypeScript + React + Ink, bundled into a single `cli.js` (~12MB)
- **String replacement**: Longest-first replacement to prevent partial matches
- **Quote-aware**: Handles both `"double"` and `'single'` quoted strings
- **State tracking**: Patch state stored in `~/.cc-i18n/state.json`
- **MD5 detection**: Detects Claude Code updates by comparing file hashes

---

## Acknowledgements

Inspired by community requests for Claude Code internationalization:
- [Issue #4866](https://github.com/anthropics/claude-code/issues/4866)
- [Issue #22356](https://github.com/anthropics/claude-code/issues/22356)
- [Issue #22386](https://github.com/anthropics/claude-code/issues/22386)

---

## License

MIT
