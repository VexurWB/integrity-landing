/**
 * Generates builder-embed.html from index.html.
 *
 * Website builders (GoHighLevel, Squarespace, WordPress, Webflow) drop custom
 * HTML straight into their own page, so the landing page has to survive next to
 * the host theme's CSS. This produces a single self-contained fragment where:
 *
 *   - every CSS selector is scoped under .ibap
 *   - :root / html / body rules collapse onto .ibap
 *   - every id is prefixed ibap- (so #top, #book etc. can't collide)
 *   - a zero-specificity reset absorbs host styles bleeding in
 *   - the Vexur widget subtree is excluded from that reset
 *   - the portrait loads from an absolute URL, so no asset upload is needed
 *
 * Run: node build-embed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'index.html';
const OUT = 'builder-embed.html';

const ROOT_CLASS = 'ibap';
const ROOT = `.${ROOT_CLASS}`;
const ID_PREFIX = `${ROOT_CLASS}-`;
const PORTRAIT_URL =
  'https://integrity-landing-seven.vercel.app/images/suz-landing.jpeg';

/** Descendants of the booking widget must never be touched by our reset. */
const NOT_WIDGET = ':not(:where([class*="vexur"] *))';

/**
 * Scoping alone is not enough for shared class names. A host rule like
 * `.wrap{max-width:220px}` still wins against our `width`, because max-width
 * constrains it regardless of specificity. So every class gets namespaced.
 * Vexur classes stay untouched — the widget loader looks for them by name.
 */
function renameClass(name) {
  if (name === ROOT_CLASS || name.startsWith('vexur')) return name;
  return `${ROOT_CLASS}-${name}`;
}

function renameClassesIn(selector) {
  return selector.replace(
    /\.(-?[A-Za-z_][\w-]*)/g,
    (_, name) => `.${renameClass(name)}`
  );
}

function must(condition, message) {
  if (!condition) throw new Error(`build-embed: ${message}`);
}

function replaceOnce(haystack, needle, replacement) {
  must(haystack.includes(needle), `expected to find ${JSON.stringify(needle)}`);
  return haystack.replace(needle, replacement);
}

/* ------------------------------------------------------------------ *
 * CSS scanning
 * ------------------------------------------------------------------ */

/** Index just past the string literal starting at `start`. */
function readString(css, start) {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += 2;
      continue;
    }
    if (css[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Body and end index of the brace block whose `{` sits at `open`. */
function readBlock(css, open) {
  let depth = 0;
  let i = open;
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const close = css.indexOf('*/', i + 2);
      i = close === -1 ? css.length : close + 2;
      continue;
    }
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = readString(css, i);
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { body: css.slice(open + 1, i), end: i + 1 };
    }
    i += 1;
  }
  return { body: css.slice(open + 1), end: css.length };
}

/** Split on `sep` at nesting depth zero. */
function splitTop(input, sep) {
  const parts = [];
  let buf = '';
  let depth = 0;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '"' || ch === "'") {
      const end = readString(input, i);
      buf += input.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  parts.push(buf);
  return parts;
}

function prefixSelector(raw) {
  const sel = renameClassesIn(raw.trim());
  if (!sel) return sel;

  // Document-level selectors describe the embed root itself.
  if (/^(?::root|html|body)$/i.test(sel)) return ROOT;
  const rootish = sel.match(/^(?::root|html|body)\b([\s\S]*)$/i);
  if (rootish) return ROOT + rootish[1];

  // Universal rules must skip the widget, and keep pseudo-elements last.
  const universal = sel.match(/^\*((?:::[a-z-]+)?)$/i);
  if (universal) return `${ROOT} *${NOT_WIDGET}${universal[1]}`;

  return `${ROOT} ${sel}`;
}

function prefixSelectorList(list) {
  return splitTop(list, ',')
    .map(prefixSelector)
    .filter(Boolean)
    .join(',\n');
}

const PASSTHROUGH_AT_RULES = new Set(['media', 'supports', 'container', 'layer']);

function scopeCss(css) {
  let out = '';
  let buf = '';
  let i = 0;

  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const close = css.indexOf('*/', i + 2);
      const end = close === -1 ? css.length : close + 2;
      buf += css.slice(i, end);
      i = end;
      continue;
    }

    const ch = css[i];

    if (ch === '"' || ch === "'") {
      const end = readString(css, i);
      buf += css.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '{') {
      // Comments sit in `buf` alongside the selector. They must be emitted
      // separately: left inline they become part of the selector, which stops
      // `:root` matching and lets a comma inside a comment split the list.
      const comments = [];
      const prelude = buf
        .replace(/\/\*[\s\S]*?\*\//g, (comment) => {
          comments.push(comment);
          return ' ';
        })
        .trim();
      const lead = comments.length ? `\n${comments.join('\n')}\n` : '\n';
      buf = '';

      const { body, end } = readBlock(css, i);
      i = end;

      if (prelude.startsWith('@')) {
        const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
        // @keyframes / @font-face bodies are not selector lists.
        const inner = PASSTHROUGH_AT_RULES.has(name) ? scopeCss(body) : body;
        out += `${lead}${prelude}{${inner}}`;
      } else {
        out += `${lead}${prefixSelectorList(prelude)}{${body}}`;
      }
      continue;
    }

    buf += ch;
    i += 1;
  }

  return out + buf;
}

/* ------------------------------------------------------------------ *
 * Extract the pieces of index.html
 * ------------------------------------------------------------------ */

const src = readFileSync(SRC, 'utf8');

const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
must(styleMatch, 'no <style> block found');

const fontsMatch = src.match(
  /<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)" rel="stylesheet">/
);
must(fontsMatch, 'Google Fonts stylesheet link not found');

const loaderMatch = src.match(
  /<script\s[^>]*src="https:\/\/embed\.vexur\.com\.au[^>]*>\s*<\/script>/
);
must(loaderMatch, 'Vexur loader <script> not found');

const bodyMatch = src.match(/<body[^>]*>([\s\S]*)<\/body>/);
must(bodyMatch, 'no <body> found');

const inlineScriptMatch = bodyMatch[1].match(/<script>([\s\S]*?)<\/script>/);
must(inlineScriptMatch, 'no inline <script> found');

/* ------------------------------------------------------------------ *
 * Markup
 * ------------------------------------------------------------------ */

let markup = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();

markup = markup
  .replace(/\bclass="([^"]+)"/g, (_, value) => {
    const renamed = value
      .trim()
      .split(/\s+/)
      .map(renameClass)
      .join(' ');
    return `class="${renamed}"`;
  })
  .replace(/\bid="([^"]+)"/g, (_, id) => `id="${ID_PREFIX}${id}"`)
  .replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${ID_PREFIX}${id}"`)
  .replace(
    /\baria-labelledby="([^"]+)"/g,
    (_, id) => `aria-labelledby="${ID_PREFIX}${id}"`
  );

markup = replaceOnce(
  markup,
  'src="images/suz-landing.jpeg"',
  `src="${PORTRAIT_URL}"`
);

// Flag the duplicate header so it can be removed in one cut.
const HEADER_END = '</header>';
const barStart = markup.indexOf(`<div class="${renameClass('cred-bar')}">`);
const headerEnd = markup.indexOf(HEADER_END);
must(barStart !== -1 && headerEnd > barStart, 'header region not found');

markup =
  markup.slice(0, barStart) +
  '<!-- OPTIONAL HEADER — your builder already provides a site header and nav.\n' +
  '     Delete everything down to "OPTIONAL HEADER ENDS" to avoid a second one. -->\n' +
  markup.slice(barStart, headerEnd + HEADER_END.length) +
  '\n<!-- OPTIONAL HEADER ENDS -->' +
  markup.slice(headerEnd + HEADER_END.length);

markup = `<div class="${ROOT_CLASS}">\n${markup}\n</div>`;

/* ------------------------------------------------------------------ *
 * Behaviour
 * ------------------------------------------------------------------ */

let js = inlineScriptMatch[1]
  // Selector literals and classList calls carry class names too.
  .replace(/'(\.[^']*)'/g, (_, selector) => `'${renameClassesIn(selector)}'`)
  .replace(
    /classList\.(add|remove|toggle)\('([^']+)'/g,
    (_, method, cls) => `classList.${method}('${renameClass(cls)}'`
  )
  .replace(
    /document\.getElementById\('([^']+)'\)/g,
    (_, id) => `document.getElementById('${ID_PREFIX}${id}')`
  )
  .replace(/document\.querySelectorAll\(/g, 'root.querySelectorAll(');

js = replaceOnce(
  js,
  "var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
  `var root = document.querySelector('${ROOT}');
  if(!root) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;`
);

// The header is optional, so every reference to it has to tolerate null.
js = replaceOnce(js, 'hdr.classList.toggle(', 'hdr && hdr.classList.toggle(');

// Same for the video, which sits inside a block someone may remove.
const VIDEO_MARK = '/* video';
const VEXUR_MARK = '/* Vexur calendar mount */';
const videoStart = js.indexOf(VIDEO_MARK);
const listenersStart = js.indexOf('playBtn.addEventListener');
const vexurStart = js.indexOf(VEXUR_MARK);
must(
  videoStart !== -1 && listenersStart > videoStart && vexurStart > listenersStart,
  'video block markers not found'
);

// Derive the guard from whatever elements the block actually looks up, so
// adding another control to index.html cannot silently escape the check.
const videoEls = [
  ...js
    .slice(videoStart, listenersStart)
    .matchAll(/var\s+(\w+)\s*=\s*document\.getElementById\(/g),
].map((match) => match[1]);
must(videoEls.length > 0, 'no video elements found to guard');

const listeners = js.slice(listenersStart, vexurStart).trimEnd();
js =
  js.slice(0, listenersStart) +
  `if(${videoEls.join(' && ')}){\n  ` +
  listeners.replace(/\n/g, '\n  ') +
  '\n  }\n\n  ' +
  js.slice(vexurStart);

/* ------------------------------------------------------------------ *
 * Assemble
 * ------------------------------------------------------------------ */

const scopedCss = scopeCss(styleMatch[1]);

// Zero-specificity so real rules always win; placed before them regardless.
const reset = `
/* ============================================================
   HOST RESET — absorbs the builder theme's own styles.
   :where() keeps this at zero specificity so the real rules
   below always win. The booking widget subtree is excluded.
   ============================================================ */
/* Inherited text properties: a theme setting these on the page body
   reaches in here, and specificity cannot block inheritance. */
${ROOT}{
  letter-spacing:normal;word-spacing:normal;text-transform:none;
  text-align:left;font-style:normal;font-variant:normal;
}
${ROOT} :where(h1,h2,h3,h4,h5,h6,p,ul,ol,li,dl,dd,blockquote,figure,cite,fieldset)${NOT_WIDGET}{
  margin:0;padding:0;border:0;font-style:normal;
  /* Themes colour headings directly, which beats inheritance. */
  color:inherit;
}
${ROOT} :where(ul,ol)${NOT_WIDGET}{list-style:none}
${ROOT} :where(a)${NOT_WIDGET}{text-decoration:none;color:inherit}
${ROOT} :where(img,video)${NOT_WIDGET}{
  max-width:100%;height:auto;display:block;border:0;
}
${ROOT} :where(button,summary)${NOT_WIDGET}{
  font:inherit;color:inherit;background:none;border:0;
}
${ROOT} :where(section,article,aside,header,footer,div)${NOT_WIDGET}{
  background:none;
}
${ROOT} :where(table)${NOT_WIDGET}{border-collapse:collapse}
`;

// Applied last: things that only differ inside a host page.
const overrides = `
/* ============================================================
   EMBED OVERRIDES
   ============================================================ */
/* The host page owns the sticky header; a second one fights it,
   and position:sticky breaks inside transformed builder wrappers. */
${ROOT} .${renameClass('site-header')}{position:relative;top:auto}
`;

const out = `<!--
  ============================================================
  Integrity Buyers Agent Perth — landing page
  WEBSITE-BUILDER EMBED (self-contained fragment)
  ============================================================

  GENERATED FILE — do not edit by hand.
  Edit index.html, then regenerate:  node build-embed.mjs

  HOW TO USE
  1. Open your builder's custom HTML / embed / code block.
  2. Paste this entire file in — every line, style and script blocks included.
  3. Publish.

  WHAT MAKES IT SAFE TO PASTE
  - All CSS is scoped under .${ROOT_CLASS}, so it cannot restyle your site.
  - A zero-specificity reset absorbs your theme's styles bleeding in.
  - All ids are prefixed "${ID_PREFIX}", so #top / #book cannot collide.
  - The portrait loads from an absolute URL — no image upload needed.

  IF SOMETHING LOOKS OFF
  - Fonts not loading? Your builder stripped the @import. Add this to the
    builder's own head/custom-code area instead:
    <link rel="stylesheet" href="${fontsMatch[1]}">
  - Booking calendar blank? The builder must allow scripts to run, and the
    Vexur widget must permit your domain. It is blocked on localhost by
    design, so always test on the published URL.
  - Two headers? Delete the block marked "OPTIONAL HEADER" below.
-->

<style>
@import url('${fontsMatch[1]}');
${reset}
/* ============================================================
   LANDING PAGE STYLES — scoped to ${ROOT}
   ============================================================ */
${scopedCss}
${overrides}
</style>

${markup}

${loaderMatch[0]}

<script>
${js}
</script>
`;

writeFileSync(OUT, out, 'utf8');
console.log(`build-embed: wrote ${OUT} (${out.length.toLocaleString()} bytes)`);
