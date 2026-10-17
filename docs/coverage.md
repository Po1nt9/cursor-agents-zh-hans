# Cursor 3.25.6 Agents Window coverage

Counted on the 3.25.6 Linux package: Glass UI props in `workbench.glass.main.js`, quoted macOS and error literals in that bundle, and core `nls.messages.json` strings that notifications and dialogs can show.

A string counts as translated when the whole label is an exact entry, a whole-string fragment, or a `^...$` regex. macOS ⌘ / ⌥ / ⇧ forms are generated from the Ctrl / Alt / Shift entry.

Not counted: editor text, terminal output, diff lines, chat markdown, lowercase log lines, icon and color setting descriptions, native-menu labels that contain `&&`, shortcut chords with no surrounding words, and storage-engine sentences.

| Category | Candidates | Translated | Untranslated | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Glass UI | 4543 | 1311 | 3232 | 28.9% |
| Core nls in the Agents window | 108 | 91 | 17 | 84.3% |
| Errors, toasts, dialogs | 1159 | 282 | 877 | 24.3% |
| macOS-only | 4 | 4 | 0 | 100% |

## Intentionally left in English

- Model names, Ultra, voice names, and brands: Cursor, Slack, GitHub, MCP, LSP, Glass, Origin, Canvas, Docker.
- Slash commands (`/plan`, `/ask`, `/create-skill`) and keys inside `ui-kbd`.
- The macOS menu bar. Install `MS-CEINTL.vscode-language-pack-zh-hans`.
- Editor, terminal, diff, and model or human chat bodies.
- `This Mac` keeps the word Mac. Plan Mode, Ask Mode, and Agent Mode are 计划模式, 提问模式, and 智能体模式.

## Still untranslated, first entries in each group

### Glass UI

- Per-chat composerData payloads and optional composerConversationState sidecars
- Composer file checkpoints (checkpointId:*)
- Inline diffs, code-block diffs, and undo/redo snapshots
- Cached cloud-agent details and metadata
- BigInt
- Promise
- Check in with participants first
- An AI teammate that works in your tools and comes back with finished work.
- Move cursor to a logical position in the view
- Scroll editor in the given direction
- Reveal the given line at the given logical position
- Go to End
- Select to End
- Register Close Tooltip
- BracketPairColorization
- Monaco rectangle renderer render pass
- Monaco rectangle renderer uniform buffer
- Monaco rectangle renderer scroll offset buffer
- Monaco rectangle renderer shape buffer
- Monaco rectangle renderer vertex buffer
- Monaco rectangle renderer shader module
- Monaco rectangle renderer render pipeline
- Monaco rectangle renderer bind group
- Monaco rectangle renderer command encoder
- Monaco scroll offset buffer
- Monaco full file cell buffer
- Monaco render pass
- Monaco uniform buffer
- Monaco atlas info uniform buffer
- Monaco glyph storage buffer
- Monaco atlas texture
- Monaco vertex buffer
- Monaco shader module
- Monaco render pipeline
- Monaco bind group
- Monaco atlas sampler
- Monaco command encoder
- Monaco canvas texture view
- Find and Replace
- Fold Unchanged

### Core nls in the Agents window

- Find / Replace
- The storage database contents have been logged to the developer tools.
- Open developer tools from the menu and select the Console tab.
- Copied
- Copy version
- Copy build date
- Copy version info
- Local Mode: enabled
- More…
- Inline diffs have been suppressed for recent changes because there are too many to display.
- Disable Protection
- Save Extension Host Profile
- Save Output As
- Select Profile Template File
- Adjust the appearance of dialog windows.
- Copyright © 2026 Anysphere. All rights reserved.
- Save Profile

### Errors, toasts, dialogs

- An unknown error occurred while applying the code action
- Failed to open this link because its target is missing.
- An unknown error occurred while resolving rename location
- Unable to replace `code` with `Cursor` on the path.
- Failed to install tunnel as a service, starting in session...
- Failed to start performance profile.
- Could not build a cursor.com link. Open a file in a git repository with an eligible remote.
- Unable to turn on the remote tunnel access. Check the Remote Tunnel Service log for details.
- Could not fetch remote environment
- Unable to write display language. Please open the runtime settings, correct errors/warnings in it and try again.
- Could not reconnect to the remote workspace.
- Cannot capture check-in. No client defined.
- Cannot capture check-in. Client does not support sending check-ins.
- Cannot flush events. No client defined.
- Cannot flush events and disable SDK. No client defined.
- Failed to retry sending
- Can't find variable: _AutofillCallbackHandler
- Unable to extract extra data from the Error object:
- Failed to serialize body
- Failed to get xhr response headers
- Cannot register a disposable on itself!
- Cannot dispose a disposable on itself!
- Unable to resolve platform.
- Cannot determine URI for module id!
- Failed to initialize
- Failed to flush events.
- Unable to save failed logs to storage
- Failed to flush stored logs
- Failed to JSON.stringify user
- Failed to fetch TXT records from DNS
- Failed to parse FallbackInfo
- Failed to save SessionID
- Unable to make request without an SDK key
- An error occurred in a StatsigClientEvent listener. This is not an issue with Statsig.
- Unable to find StatsigClient instance
- Failed to hydrate conversation step from conversation state.
- Failed to hydrate user message from conversation state.
- Failed to hydrate conversation turn from conversation state.
- Cannot specify both `message` and `error` params
- Cannot mix number and bigint in multiple_of check.

### macOS-only

这一组里剩下的快捷键都是单独的按键组合，不单独计数。带句子的 macOS 文案已经译完。

Glass exact entries live in `dictionary/exact.json`. 476 core strings live in `dictionary/nls.json`, matched from microsoft/vscode-loc `main.i18n.json` (MIT).
