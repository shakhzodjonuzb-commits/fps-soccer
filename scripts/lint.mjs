import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

console.log('TypeScript version:', ts.version);
console.log('TypeScript exports:', Object.keys(ts).slice(0, 20));
console.log('ScriptTarget:', ts.ScriptTarget);
console.log('createSourceFile:', typeof ts.createSourceFile);
const roots = ['src', 'tests'];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(target);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);
let errors = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const diagnostic of parsed.parseDiagnostics) {
    const { line, character } = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    console.error(`${file}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    errors++;
  }
  if (/\b(TODO|FIXME|PLACEHOLDER)\b/.test(source)) {
    console.error(`${file}: unresolved implementation marker found`);
    errors++;
  }
  if (/https?:\/\//.test(source) && !file.endsWith('lint.mjs')) {
    console.error(`${file}: remote runtime URL found; bundled game assets must be local`);
    errors++;
  }
}
if (errors) process.exitCode = 1;
else console.log(`Source hygiene OK (${files.length} TypeScript files).`);
