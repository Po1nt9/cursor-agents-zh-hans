# Cursor 3.25.6 Agents Window coverage

Counted on the 3.25.6 Linux package: Glass UI props in `workbench.glass.main.js`, quoted macOS and error literals in that bundle, and core `nls.messages.json` strings that notifications and dialogs can show. `\xNN` escapes are decoded, so a label stored as `\xB7` is counted as the middle dot the user sees.

A string counts as translated when the whole label is an exact entry, a whole-string fragment, or a `^...$` regex. macOS ⌘ / ⌥ / ⇧ forms are generated from the Ctrl / Alt / Shift entry.

The percentages below use only real UI and real messages. Noise and intentionally English names are out of the denominator. The noise list is [coverage-noise.txt](coverage-noise.txt). Names left in English are [coverage-english.txt](coverage-english.txt).

| Category | Real candidates | Translated | Untranslated | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Glass UI | 4394 | 4394 | 0 | 100% |
| Core nls in the Agents window | 85 | 85 | 0 | 100% |
| Errors, toasts, dialogs | 1071 | 1071 | 0 | 100% |
| macOS-only | 4 | 4 | 0 | 100% |

Real UI (Glass, core nls, and macOS sentences together) is 4483 / 4483. Real errors, toasts, dialogs, banners, and empty states are 1071 / 1071.

Excluded from those denominators: 187 noise strings and 72 intentionally English names. The previous table counted both, which is why Glass was 4543 candidates at 28.9% and errors were 1159 at 24.3%. Error-shaped nls strings stay in the error row, so the core-nls row is smaller than the old 108.

## Noise rules

A candidate is noise only when one of these matches. Everything else a person can see in a button, menu, setting, notification, banner, dialog, inline error, or empty state is real and is translated.

- **url**: The whole string is a URL (`http`, `https`, or `www`). A sentence that mentions cursor.com stays real. The host stays as written.
- **css-class**: CSS or class token: `glass-`, `ui-`, `vscode-`, `monaco-`, `xterm-`, or `className`.
- **internal-id**: CamelCase or PascalCase identifier, ALL_CAPS enum, JS type name (`BigInt`, `Promise`), or a storage-engine sentence (`agentKv`, `bubbleId`, `checkpointId`, `composerData`, `ItemTable`, `SQLite`, `WAL`, `Freelist`, `B-tree`).
- **enum-key**: A bare enum or boolean token (`True`, `False`, `Err`, `Obs`, `Mem`) with no surrounding words.
- **telemetry**: Statsig, histogram, or telemetry instrumentation, not a product sentence.
- **log-only**: SDK, renderer, xhr, disposable, shader, or tree-view log line (`Can't get element`, `FAILED to`, Monaco GPU buffer names). Not a notification.
- **debug-panel**: Startup-performance marks, Sentry renderer snapshots, and the in-app dialog gallery (`Pretty Dialog`, `Marks timeline`, `Hydration is lazy`).
- **dev-only**: Marked `(For Testing)` or `(Dev-only)`, or a `Developer:` / `Debug:` command that only exists for engineers.

## Intentionally English

These are user-visible and are not noise, but [STYLE.md](../dictionary/STYLE.md) keeps them in English, so they are not in the percentage:

- Model names (`Claude 3.7 Sonnet`, `Grok 3`, `Gemini 2.5 Pro`) and plan names (`Ultra`, `Pro`).
- Voice names (`Altair`, `Luna`, and the other names in the English list).
- Product and protocol names when the whole label is the name: Cursor, Slack, GitHub, GitLab, MCP, LSP, Glass, Origin, Canvas, Docker, Bugbot, VS Code.
- Slash commands and the shortcut labels `Enter` and `Command K`. Keys inside `ui-kbd` are unchanged.
- The macOS menu bar. Install `MS-CEINTL.vscode-language-pack-zh-hans`.
- Editor text, terminal output, diff lines, and model or human chat bodies.

`This Mac` keeps the word Mac. Plan Mode, Ask Mode, and Agent Mode are 计划模式, 提问模式, and 智能体模式.

## Where the translations live

Glass sentences and the new error copy live in `dictionary/exact.json` and `dictionary/ui.json`. `exact.json` wins when both have the same English. 794 of the new lines are the vscode-loc zh-Hans pack (MIT) for an identical English string, then normalized to 你, 账户, full-width punctuation, and a space between Han and Latin or digits. Cursor-only strings are written for this patch. Core strings that were already selected for the Agents window stay in `dictionary/nls.json`.
