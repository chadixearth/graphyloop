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
