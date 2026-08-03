/**
 * Sanity-checks builder-embed.html: every CSS rule must be scoped under .ibap,
 * no id may be unprefixed, and no relative asset paths may remain.
 *
 * Run: node verify-embed.mjs
 */
import { readFileSync } from 'node:fs';

const html = readFileSync('builder-embed.html', 'utf8');
const problems = [];

/* The instructions comment mentions style/script, so take the real block. */
const styleOpen = html.indexOf('<style>');
const styleClose = html.indexOf('</style>');
if (styleOpen === -1 || styleClose === -1) {
  problems.push('no style block found');
}
const css = html.slice(styleOpen + '<style>'.length, styleClose);

/* Strip comments and string literals so braces/commas inside them don't lie. */
const clean = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""');

function splitTop(input, sep) {
  const parts = [];
  let buf = '';
  let depth = 0;
  for (const ch of input) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

/* Walk top-level and one level of at-rule nesting. */
function checkRules(block, insideKeyframes) {
  let i = 0;
  let buf = '';
  let depth = 0;
  let start = 0;

  while (i < block.length) {
    const ch = block[i];
    if (ch === '{') {
      if (depth === 0) {
        start = i;
        buf = block.slice(0, i);
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const prelude = buf.trim();
        const body = block.slice(start + 1, i);

        if (prelude.startsWith('@')) {
          const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
          const nested = ['media', 'supports', 'container', 'layer'];
          if (nested.includes(name)) checkRules(body, false);
          // @keyframes selectors are percentages; nothing to scope.
        } else if (!insideKeyframes) {
          for (const sel of splitTop(prelude, ',')) {
            const s = sel.trim();
            if (!s) continue;
            if (!s.startsWith('.ibap')) problems.push(`unscoped selector: ${s}`);
          }
        }

        block = block.slice(i + 1);
        i = 0;
        buf = '';
        continue;
      }
    }
    i += 1;
  }
}
checkRules(clean, false);

/* Every class must be namespaced, or a host rule with the same name can still
   win on properties we don't declare (e.g. their max-width vs our width). */
const allowedClass = (name) =>
  name === 'ibap' || name.startsWith('ibap-') || name.startsWith('vexur');

for (const m of html.matchAll(/\bclass="([^"]+)"/g)) {
  for (const name of m[1].trim().split(/\s+/)) {
    if (name && !allowedClass(name)) problems.push(`unnamespaced class: ${name}`);
  }
}
for (const m of clean.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
  if (!allowedClass(m[1])) problems.push(`unnamespaced class in CSS: .${m[1]}`);
}

/* Ids and in-page anchors must be namespaced. */
for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
  if (!m[1].startsWith('ibap-')) problems.push(`unprefixed id: ${m[1]}`);
}
for (const m of html.matchAll(/\bhref="#([^"]+)"/g)) {
  if (!m[1].startsWith('ibap-')) problems.push(`unprefixed anchor: #${m[1]}`);
}

/* No relative asset paths — the builder won't have the files. */
for (const m of html.matchAll(/\b(?:src|href)="(?!https?:|#|mailto:|tel:)([^"]+)"/g)) {
  problems.push(`relative asset path: ${m[1]}`);
}

/* The design tokens must land on the wrapper itself. If :root survives the
   scoping pass, every var() silently resolves to nothing and the page inherits
   the host theme instead — which looks like the embed has no CSS at all. */
const tokenRule = clean.match(/(^|})\s*\.ibap\s*\{([^}]*)\}/);
if (!tokenRule) {
  problems.push('no bare `.ibap {}` rule — design tokens have nowhere to live');
} else {
  for (const token of ['--navy', '--turquoise', '--display', '--body', '--ink']) {
    if (!tokenRule[2].includes(token)) {
      problems.push(`token ${token} not defined on .ibap`);
    }
  }
}
if (/:root/.test(clean)) problems.push(':root survived scoping');
for (const m of clean.matchAll(/\.ibap[^{,]*\/\*/g)) {
  problems.push(`comment embedded in selector: ${m[0]}`);
}

/* Structural expectations. */
if (!/<div class="ibap">/.test(html)) problems.push('missing .ibap wrapper');
if (/<(?:!DOCTYPE|html|head|body)\b/i.test(html)) {
  problems.push('fragment should not contain document-level tags');
}

if (problems.length) {
  console.error(`verify-embed: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('verify-embed: OK — all rules scoped, all ids prefixed, no local assets');
