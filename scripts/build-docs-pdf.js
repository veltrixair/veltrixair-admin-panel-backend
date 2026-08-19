/**
 * Renders docs/TECHNICAL-DOCUMENTATION.md to a print-ready PDF.
 *
 *   node scripts/build-docs-pdf.js
 *
 * Uses the Chromium already installed on the machine (Chrome or Edge) via its
 * headless --print-to-pdf mode, so no browser is downloaded. Markdown is
 * converted with `marked`; layout and pagination come from the CSS below.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { marked } = require('marked');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'TECHNICAL-DOCUMENTATION.md');
const OUTPUT = path.join(ROOT, 'docs', 'Technical-Documentation.pdf');

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findBrowser() {
  const found = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      'No Chrome or Edge installation found. Install one, or add its path to BROWSER_CANDIDATES.',
    );
  }
  return found;
}

const CSS = `
  @page { size: A4; margin: 20mm 16mm 18mm 16mm; }

  :root {
    --ink:      #16191d;
    --muted:    #5a6472;
    --rule:     #d8dee6;
    --accent:   #0f5c8c;
    --surface:  #f6f8fa;
  }

  * { box-sizing: border-box; }

  body {
    font-family: "Segoe UI", -apple-system, Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: var(--ink);
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Title block ------------------------------------------------------- */
  h1 {
    font-size: 26pt;
    line-height: 1.2;
    margin: 0 0 4pt;
    color: var(--accent);
    letter-spacing: -0.4pt;
  }
  h1 + h2 {
    font-size: 15pt;
    font-weight: 500;
    color: var(--muted);
    border: 0;
    margin: 0 0 22pt;
    padding: 0;
  }

  h2 {
    font-size: 15pt;
    margin: 26pt 0 9pt;
    padding-bottom: 5pt;
    border-bottom: 1.5pt solid var(--accent);
    color: var(--accent);
    page-break-after: avoid;
  }
  h3 {
    font-size: 11.5pt;
    margin: 16pt 0 6pt;
    color: var(--ink);
    page-break-after: avoid;
  }
  h4 {
    font-size: 10.5pt;
    margin: 12pt 0 4pt;
    color: var(--muted);
    page-break-after: avoid;
  }

  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }

  strong { font-weight: 650; }

  a { color: var(--accent); text-decoration: none; }

  /* Tables ------------------------------------------------------------ */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 14pt;
    font-size: 8.8pt;
    page-break-inside: avoid;
  }
  th {
    background: var(--surface);
    text-align: left;
    font-weight: 650;
    padding: 5pt 7pt;
    border: 0.6pt solid var(--rule);
    color: var(--ink);
  }
  td {
    padding: 5pt 7pt;
    border: 0.6pt solid var(--rule);
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #fbfcfd; }

  /* Code -------------------------------------------------------------- */
  code {
    font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
    font-size: 8.6pt;
    background: var(--surface);
    padding: 1pt 3pt;
    border-radius: 2pt;
  }
  pre {
    background: var(--surface);
    border: 0.6pt solid var(--rule);
    border-left: 2.5pt solid var(--accent);
    padding: 8pt 10pt;
    border-radius: 3pt;
    overflow-x: auto;
    page-break-inside: avoid;
    margin: 8pt 0 12pt;
  }
  pre code { background: none; padding: 0; font-size: 8.4pt; line-height: 1.45; }

  /* Callouts ---------------------------------------------------------- */
  blockquote {
    margin: 10pt 0;
    padding: 7pt 12pt;
    border-left: 2.5pt solid #c8801a;
    background: #fdf7ec;
    color: #4a3a1e;
    page-break-inside: avoid;
  }
  blockquote p { margin: 0; }

  hr {
    border: 0;
    border-top: 0.6pt solid var(--rule);
    margin: 18pt 0;
  }

  /* Start each numbered section on a fresh page, except the first. */
  h2.page-break { page-break-before: always; }
`;

function build() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source not found: ${SOURCE}`);
  }

  const markdown = fs.readFileSync(SOURCE, 'utf8');
  let html = marked.parse(markdown, { mangle: false, headerIds: false });

  // Page-break before each top-level numbered section and the appendix,
  // but never before the first one (which follows the title block).
  let seen = 0;
  html = html.replace(/<h2>/g, () => {
    seen++;
    return seen <= 1 ? '<h2>' : '<h2 class="page-break">';
  });

  const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Veltrixair.com Backend — Technical Documentation</title>
<style>${CSS}</style></head>
<body>${html}</body>
</html>`;

  const tmpHtml = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'vtx-docs-')),
    'documentation.html',
  );
  fs.writeFileSync(tmpHtml, page, 'utf8');

  const browser = findBrowser();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtx-profile-'));

  execFileSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${profileDir}`,
      '--no-pdf-header-footer',
      `--print-to-pdf=${OUTPUT}`,
      `file:///${tmpHtml.replace(/\\/g, '/')}`,
    ],
    { stdio: 'pipe', timeout: 120000 },
  );

  if (!fs.existsSync(OUTPUT)) {
    throw new Error('Chromium did not produce a PDF.');
  }

  const kb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
  console.log(`Rendered with: ${path.basename(browser)}`);
  console.log(`Output:        ${path.relative(ROOT, OUTPUT)} (${kb} KB)`);
}

build();
