// =============================================================================
// frontmatter.mjs — opencode agent frontmatter → claude agent/command files.
//
// Zero-dependency ESM (Node >= 20). Parses the opencode-style `---`-delimited
// frontmatter used by agents/*.md and emits claude-agent / claude-slash-command
// file content per the graphyloop build contract (B3).
//
// Supported description shapes:
//   description: plain text
//   description: "quoted text"        (outer double quotes stripped)
//   description: >                    (folded scalar, lines joined with spaces)
//
// All other frontmatter keys (mode, temperature, steps, permission, model, ...)
// are intentionally dropped. `model` is OMITTED so claude inherits its default.
// The agent body after the closing `---` is preserved verbatim.
// =============================================================================

import path from 'node:path';

// Contract classification (CONTRACTS.md B3): read-only agents get a reduced
// tool set; every other agent is a writer.
export const READ_ONLY_TOOLS = 'Read, Grep, Glob, WebFetch, Task';
export const WRITER_TOOLS = 'Read, Write, Edit, Bash, Grep, Glob, WebFetch, Task';

export const READ_ONLY_AGENTS = new Set([
  'chadi-explorer',
  'chadi-vision',
  'graphcrew-investigator',
  'graphcrew-reviewer',
  'chadi-reviewer',
  'chadi-security',
  'chadi-performance',
  'chadi-quality',
  'chadi-memory',
  'chadi-think',
  'chadi-architect',
  'chadi-docs',
  'chadi-council',
]);

// Read-only classification exposed as a plain array (handy for tests).
export const READ_ONLY_AGENT_NAMES = [...READ_ONLY_AGENTS];

export function toolsForAgent(name) {
  return READ_ONLY_AGENTS.has(name) ? READ_ONLY_TOOLS : WRITER_TOOLS;
}

function unquote(value) {
  const s = value.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// Parse leading `---` frontmatter block. Returns:
//   { attrs: {name?, description?}, body: string, hasFrontmatter: boolean }
function parseFrontmatter(text) {
  const lines = String(text).split('\n');
  let i = 0;

  // Skip leading blank lines, then expect the opening delimiter.
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || lines[i].trim() !== '---') {
    // No frontmatter: treat the whole file as body, empty attrs.
    return { attrs: {}, body: String(text), hasFrontmatter: false };
  }

  i++; // past opening `---`
  const attrs = {};
  let sawDescription = false;

  while (i < lines.length && lines[i].trim() !== '---') {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
    if (m) {
      const key = m[1];
      const value = m[2] === undefined ? '' : m[2];

      if (key === 'name') {
        attrs.name = value.trim();
      } else if (key === 'description' && !sawDescription) {
        sawDescription = true;
        if (value.trim() === '>') {
          // Folded scalar: consume following indented (or blank) lines.
          i++;
          const parts = [];
          while (
            i < lines.length &&
            lines[i].trim() !== '---' &&
            (lines[i].trim() === '' || /^\s/.test(lines[i]))
          ) {
            if (lines[i].trim() !== '') parts.push(lines[i].trim());
            i++;
          }
          attrs.description = parts.join(' ');
          continue; // `i` already advanced past the folded block
        } else {
          attrs.description = unquote(value);
        }
      }
      // mode / temperature / steps / permission / model / etc: ignored.
    }
    i++;
  }

  const bodyStart = i + 1; // skip the closing `---`
  const body = lines.slice(bodyStart).join('\n');
  return { attrs, body, hasFrontmatter: i < lines.length };
}

// opencode agent source → claude agent file content.
// name comes from the filename (sans .md); model omitted (inherit).
export function claudeAgentFromSource(sourceMdText, filename) {
  const { attrs, body } = parseFrontmatter(sourceMdText);
  const name = filename
    ? path.basename(String(filename), '.md')
    : attrs.name || 'agent';
  const description = attrs.description !== undefined ? attrs.description : '';
  const tools = toolsForAgent(name);
  return `---\nname: ${name}\ndescription: ${description}\ntools: ${tools}\n---\n\n${body}`;
}

// claude slash-command file content (name carried by the file itself).
export function claudeCommandFile(name, description, templateBody) {
  const desc = String(description ?? '').replace(/\r?\n/g, ' ').trim();
  const body = templateBody === undefined || templateBody === null ? '' : String(templateBody);
  return `---\ndescription: ${desc}\n---\n\n${body}`;
}

// YAML plain scalars break on `: `, ` #`, leading indicators and edge spaces;
// omp parses agent frontmatter as real YAML, so such descriptions are quoted.
function yamlScalar(text) {
  const s = String(text);
  if (s === '' || /^[\s>|!&*\-?{}[\]%@`"'#,]|:\s|:$|\s#|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

// opencode agent source → Oh My Pi agent file: frontmatter reduced to `name` +
// `description` (no model/tools, so the agent inherits omp's model); body verbatim.
export function ompAgentFromSource(sourceMdText, filename) {
  const { attrs, body } = parseFrontmatter(sourceMdText);
  const name = filename
    ? path.basename(String(filename), '.md')
    : attrs.name || 'agent';
  const description = attrs.description !== undefined ? attrs.description : '';
  return `---\nname: ${name}\ndescription: ${yamlScalar(description)}\n---\n\n${body}`;
}

// TOML basic string (single line) escaping.
function tomlBasic(value) {
  return `"${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, (c) => (c === '\t' ? '\\t' : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`))}"`;
}

// TOML multi-line basic string body: escape backslashes, break up runs of
// three quotes, and escape a trailing quote so it cannot fuse with the
// closing delimiter. Control characters other than tab/newline become \uXXXX.
function tomlMultiline(value) {
  let s = String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/"""/g, '""\\"');
  if (s.endsWith('"')) s = `${s.slice(0, -1)}\\"`;
  return s;
}

// Gemini CLI custom command (~/.gemini/commands/<name>.toml). `$ARGUMENTS`
// becomes Gemini's `{{args}}` placeholder.
export function geminiCommandFile(name, description, templateBody) {
  const desc = String(description ?? '').replace(/\r?\n/g, ' ').trim();
  const body = String(templateBody ?? '').replace(/\$ARGUMENTS/g, '{{args}}');
  return `description = ${tomlBasic(desc)}\nprompt = """\n${tomlMultiline(body)}"""\n`;
}
