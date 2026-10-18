/**
 * Split coverage candidates into real UI, intentionally English, or noise.
 * Noise is not a coverage miss. The rules are the ones documented in docs/coverage.md.
 */

const VOICE_NAMES = new Set([
  'Altair', 'Ara', 'Atlas', 'Aurora', 'Carina', 'Castor', 'Celeste', 'Cosmo',
  'Eve', 'Helios', 'Helix', 'Iris', 'Kepler', 'Leo', 'Liora', 'Lumen', 'Luna',
  'Lux', 'Naksh', 'Orion', 'Perseus', 'Rex', 'Rigel', 'Sal', 'Sirius', 'Ursa',
  'Zagan', 'Zenith',
]);

const ENGLISH_PHRASES = new Set([
  'AWS Bedrock', 'Azure DevOps', 'Azure OpenAI', 'Claude 3.7 Sonnet', 'Claude Code',
  'Gemini 2.5 Flash', 'Gemini 2.5 Pro', 'GPT-3.5 Turbo', 'Grok 3', 'Llama 3.2 3B',
  'Mistral Large', 'Galaxy S25 Ultra', 'Pixel 10', 'Microsoft Entra ID', 'VS Code',
  'React DevTools', 'React #', 'Cursor Origin',
]);

const MODEL_NAMES = new Set([
  'Claude 3.7 Sonnet', 'Claude Code', 'Gemini 2.5 Flash', 'Gemini 2.5 Pro',
  'GPT-3.5 Turbo', 'Grok 3', 'Llama 3.2 3B', 'Mistral Large',
]);

const SHORTCUT_LABELS = new Set(['Command K', 'Enter']);

const PRODUCT_NAMES = new Set([
  'Cursor', 'Slack', 'GitHub', 'GitLab', 'MCP', 'LSP', 'Claude', 'Glass',
  'Origin', 'Docker', 'Dockerfile', 'Canvas', 'Bugbot', 'Ultra', 'Pro', 'Max',
  'React', 'Angular', 'Vue', 'Python', 'TypeScript', 'Rust', 'Emacs', 'Vim',
  'Makefile', 'Git', 'Graphite', 'Tab', 'Markdown',
]);

export const NOISE_RULES = [
  ['url', 'The whole string is a URL (http, https, or www). A sentence that mentions cursor.com stays real and is translated, with the host left as written.'],
  ['css-class', 'CSS or class token: glass-, ui-, vscode-, monaco-, xterm-, or className.'],
  ['internal-id', 'CamelCase or PascalCase identifier, ALL_CAPS enum, JS type name, or storage-engine token (agentKv, bubbleId, checkpointId, composerData, ItemTable, SQLite, WAL, Freelist, B-tree).'],
  ['enum-key', 'A bare enum or boolean token (True, False, Err, Obs, Mem) with no surrounding words.'],
  ['telemetry', 'Statsig, histogram, or telemetry instrumentation, not a product sentence.'],
  ['log-only', 'SDK, renderer, xhr, disposable, or tree-view log line that is not a notification.'],
  ['debug-panel', 'Developer-tools, startup-performance, Sentry, or in-app dialog gallery chrome.'],
  ['dev-only', 'Marked (For Testing), (Dev-only), or Developer:/Debug: command that only exists for engineers.'],
];

function hasSpace(text) {
  return /\s/.test(text);
}

export function triageCandidate(text) {
  const value = String(text || '').trim();
  if (!value) return { kind: 'noise', bucket: 'internal-id' };

  if (VOICE_NAMES.has(value)) return { kind: 'english', bucket: 'voice-name' };
  if (MODEL_NAMES.has(value)) return { kind: 'english', bucket: 'model-name' };
  if (SHORTCUT_LABELS.has(value)) return { kind: 'english', bucket: 'shortcut' };
  if (PRODUCT_NAMES.has(value) || ENGLISH_PHRASES.has(value)) return { kind: 'english', bucket: 'product-name' };
  if (/^\/[A-Za-z0-9][A-Za-z0-9-]*$/.test(value)) return { kind: 'english', bucket: 'slash-command' };

  if (/^https?:\/\/|^www\./i.test(value)) return { kind: 'noise', bucket: 'url' };
  if (/^(glass-|ui-|vscode-|monaco-|xterm-)/.test(value) || /\bclassName\b/.test(value)) {
    return { kind: 'noise', bucket: 'css-class' };
  }
  if (/^(True|False|Err|Obs|Mem)$/.test(value)) return { kind: 'noise', bucket: 'enum-key' };
  if (/^(BigInt|Promise|NaN|Symbol|Undefined)$/.test(value)) return { kind: 'noise', bucket: 'internal-id' };
  if (!hasSpace(value) && /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(value)) {
    return { kind: 'noise', bucket: 'internal-id' };
  }
  if (!hasSpace(value) && /^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(value)) {
    return { kind: 'noise', bucket: 'internal-id' };
  }
  if (!hasSpace(value) && /^[A-Z][A-Z0-9_]{2,}$/.test(value)) return { kind: 'noise', bucket: 'internal-id' };
  if (/agentKv:|bubbleId:|checkpointId:|composerData|composerConversationState|ItemTable|SQLite|WAL sidecar|Freelist|B-tree/.test(value)) {
    return { kind: 'noise', bucket: 'internal-id' };
  }

  if (/\bstatsig\b|\bhistogram\b|\btelemetry\b/i.test(value)) return { kind: 'noise', bucket: 'telemetry' };

  if (/^Can't (get|set|add|remove|call|expand|compress|replace|restore|run) /.test(value)) {
    return { kind: 'noise', bucket: 'log-only' };
  }
  if (/^FAILED to /.test(value)) return { kind: 'noise', bucket: 'log-only' };
  if (/JSON\.stringify|_Autofill|FallbackInfo|SessionID|xhr response|xhr breadcrumb|SDK key|disposable on itself|shader compile|mix number and bigint|multiple_of check|No client defined|flush events|serialize body|extract extra data from the Error|fetch TXT records|hydrate conversation|hydrate user message|hydrate conversation turn/.test(value)) {
    return { kind: 'noise', bucket: 'log-only' };
  }
  if (/^Monaco .+ (buffer|pipeline|shader|sampler|encoder|texture|bind group|render pass|module)$/i.test(value)) {
    return { kind: 'noise', bucket: 'log-only' };
  }
  if (/\b(stack trace|EINVAL|EACCES|TypeError)\b/.test(value)) return { kind: 'noise', bucket: 'log-only' };

  if (/\(For Testing\)|\(Dev-only\)|\bDev-only\b/.test(value)) return { kind: 'noise', bucket: 'dev-only' };
  if (/^(Developer|Debug): /.test(value)) return { kind: 'noise', bucket: 'dev-only' };
  if (/\b(Startup Performance|Performance Profile|Performance Bar|Performance Tracks|Heap Snapshot|Tracked Disposables|Tracking Disposables|unresponsive|Sentry event|event-loop delay|ripgrep-backed|Perfetto|Auth Debug|Registry Debug|Service Debug|Data Handle Debugging|Debug Timeout|simulate production mode|OOM Crash|Hang Renderer)\b/.test(value)) {
    return { kind: 'noise', bucket: 'debug-panel' };
  }
  if (/^(Duration|Interval|Mark|Marks|Offset|Workbench|Jank|Dogfood|Hydration)$/.test(value)) {
    return { kind: 'noise', bucket: 'debug-panel' };
  }
  if (/This dialog demonstrates|This is a callout|This combines deemphasized|Async Action Dialog|Async Operation$|Basic Dialog|Callout Dialog|Don't Ask Again Dialog|Error Dialog|Multi-Button Loading|Multi-line Dialog|No Icon Dialog|Pretty Dialog|Styled Messages|Primary Action$|Glass Extensions|Glass present|Marks timeline|Spans may nest|Hydration is lazy|Pending Writes|Cache Keys:|Cached Payloads|Explorer Orchestrator|Display Path:|Remote Authority:|Repo URL:|Repo path:|Saved At:|Filter by cache key|Offset is ms after|No intervals for this section|No path metadata|No repositories in payload|React root →|Commit → present|Present → usable|Runs in a local web-worker|Runs in a separate local OS|Runs in the remote extension host/.test(value)) {
    return { kind: 'noise', bucket: 'debug-panel' };
  }

  return { kind: 'real', bucket: 'ui' };
}

export function noiseRuleText() {
  return NOISE_RULES.map(([id, rule]) => `- **${id}**: ${rule}`).join('\n');
}
