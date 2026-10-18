# Cursor 3.25.6 Agents Window coverage

## 这一版实际量过的

2026-10-18，对 Cursor 3.25.6 Linux 包里的 `workbench.glass.main.js` 跑了本仓库的 `scan --bundles glass`（界面属性抽取，不是下面的引号扫描，也不是 acorn 报错标题）。结果是 **4668 / 4928** 条候选有整句译文。剩下的 260 条主要是开发者对话框、Monaco / GPU 名字、模型名，以及按术语留在英文里的品牌（Canvas、Pro、Ultra、GitHub、Cursor、Enter）。这次扫描在发布译文（下方有新消息、PR 时间线、口语回改）之前，发布构建没有重跑。这一版没有在登录过的 Cursor 里看过。

独立复核 `125af33` 时，acorn 标题集是 3097 / 3107，另有 9 条部分覆盖。那个数字不是这一次重测的。下面的 100% 表和 3101 / 3107 是更早一次写进仓库的计数，这一次没有用同样的方法重跑，不要把它当成这一版的新结果。

Counted on the 3.25.6 Linux package: Glass UI props in `workbench.glass.main.js`, quoted macOS and error literals in that bundle, and core `nls.messages.json` strings that notifications and dialogs can show. `\xNN` escapes are decoded, so a label stored as `\xB7` is counted as the middle dot the user sees.

A string counts as translated when the whole label is an exact entry, a whole-string fragment, or a `^...$` regex. macOS ⌘ / ⌥ / ⇧ forms are generated from the Ctrl / Alt / Shift entry.

The percentages below use only real UI and real messages. Noise and intentionally English names are out of the denominator. The noise list is [coverage-noise.txt](coverage-noise.txt). Names left in English are [coverage-english.txt](coverage-english.txt).

| Category | Real candidates | Translated | Untranslated | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Glass UI | 4394 | 4394 | 0 | 100% |
| Core nls in the Agents window | 85 | 85 | 0 | 100% |
| macOS-only | 4 | 4 | 0 | 100% |

The Glass UI, core nls, and macOS rows above are the quote-scanner pass. They were not remeasured with the AST extractor.

Error, toast, and dialog copy is counted with acorn on `workbench.glass.main.js` (the same literals and `classify.mjs` rules as the 73e441a check: notify + keyword + nls-keyword, `{n}` filled with `foo` and `3`). That set is 3,107 strings. This tree translates 3,101 of them. The other 6 stay partial on purpose, because the Chinese keeps a command or filename: `agent worker`, `agent worker start`, the two `git config` lines, `cursor-socket`, `--enable-proposed-api`, and `rules-index.mdc`. Inside notification, toast, and dialog calls it is 556 / 557, with that one git-config partial. `throw` / `new Error` strings are outside that headline: 344 covered, 0 partial, 653 uncovered. “Covered” means the output has Han and no run of two English words after `foo` and brand names are removed. A single leftover word still counts. The earlier 3,107 / 3,107 figure counted verb splices such as `pause` and `install` as covered. The old “1,071 / 1,071” row was the quote scanner, which misses template literals, and is not the number to use.

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
