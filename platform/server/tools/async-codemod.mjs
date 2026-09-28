// One-off codemod used for the move to an async DB interface (kept for reference and reuse).
// Usage: node tools/async-codemod.mjs <tsconfig dir> <file…>
// Repeats until nothing changes:
//   1. `db.prepare(` / `db.exec(` get an `await`.
//   2. Every function that contains an `await` becomes `async`.
//   3. Every call whose type is a Promise gets an `await`, unless it is already awaited, returned,
//      the concise body of an arrow, or an element of Promise.all([...]).
//   4. `.map(cb)` with a Promise-returning callback is wrapped in `await Promise.all(...)`.
// Anything it cannot fix safely (forEach/filter/find/some with async callbacks, async getters) is reported.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const [dir, ...files] = process.argv.slice(2);
const abs = files.map((f) => path.resolve(f));
const cfgPath = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, path.dirname(cfgPath));

// step 1 (textual, once)
for (const f of abs) {
  const src = fs.readFileSync(f, 'utf8');
  const out = src.replace(/(?<!await )(?<![\w.])((?:this\.)?db\.(?:prepare|exec)\()/g, 'await $1');
  if (out !== src) fs.writeFileSync(f, out);
}

const isFn = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
const isAsync = (n) => (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
const enclosingFn = (n) => { let p = n.parent; while (p && !isFn(p)) { if (ts.isGetAccessor(p) || ts.isConstructorDeclaration(p)) return p; p = p.parent; } return p; };
const reports = new Set();

for (let round = 0; round < 40; round++) {
  const program = ts.createProgram(abs, parsed.options);
  const checker = program.getTypeChecker();
  const isPromise = (t) => {
    if (!t) return false;
    if (t.isUnion()) return t.types.some(isPromise);
    const s = t.getSymbol() ?? t.aliasSymbol;
    return s?.getName() === 'Promise';
  };
  let changed = 0;
  for (const sf of program.getSourceFiles()) {
    if (!abs.includes(path.resolve(sf.fileName))) continue;
    const edits = []; // [pos, text]
    const asyncAt = new Set();
    const markAsync = (fn) => {
      if (!fn || isAsync(fn) || asyncAt.has(fn)) return;
      if (ts.isGetAccessor(fn) || ts.isConstructorDeclaration(fn)) { reports.add(`${sf.fileName}:${sf.getLineAndCharacterOfPosition(fn.getStart()).line + 1} await inside getter/constructor`); return; }
      asyncAt.add(fn);
      let pos;
      if (ts.isArrowFunction(fn)) pos = fn.getStart(sf);
      else if (ts.isMethodDeclaration(fn)) pos = fn.name.getStart(sf);
      else pos = fn.getChildren(sf).find((c) => c.kind === ts.SyntaxKind.FunctionKeyword).getStart(sf);
      edits.push([pos, 'async ']);
    };
    const visit = (n) => {
      if (ts.isAwaitExpression(n)) markAsync(enclosingFn(n));
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
        const cb = n.arguments[0];
        const cbReturnsPromise = cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && (isAsync(cb) || isPromise(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(cb))));
        if (cbReturnsPromise && ['forEach', 'filter', 'find', 'some', 'every', 'sort', 'reduce', 'flatMap'].includes(name)) {
          reports.add(`${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} async callback in .${name}()`);
        }
        const wrapped = n.parent && ts.isCallExpression(n.parent) && n.parent.expression.getText(sf) === 'Promise.all';
        if (name === 'map' && cbReturnsPromise && !wrapped) {
          edits.push([n.getStart(sf), 'await Promise.all('], [n.getEnd(), ')']);
          markAsync(enclosingFn(n));
        } else if (!(name === 'map' && cbReturnsPromise)) {
          const t = checker.getTypeAtLocation(n);
          const p = n.parent;
          const skip = !isPromise(t) || ts.isAwaitExpression(p) || ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)
            || ts.isVoidExpression(p) || (ts.isArrayLiteralExpression(p) && p.parent && ts.isCallExpression(p.parent) && p.parent.expression.getText(sf) === 'Promise.all')
            || wrapped || name === 'then' || name === 'catch' || name === 'finally'
            || (ts.isPropertyAccessExpression(p) && ['then', 'catch', 'finally'].includes(p.name.text))
            || (ts.isParenthesizedExpression(p) && ts.isAwaitExpression(p.parent));
          if (!skip) {
            const needsParens = (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p) || (ts.isCallExpression(p) && p.expression === n)) && p.expression === n;
            edits.push([n.getStart(sf), needsParens ? '(await ' : 'await ']);
            if (needsParens) edits.push([n.getEnd(), ')']);
            markAsync(enclosingFn(n));
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!edits.length) continue;
    // de-duplicate identical insertions, apply from the end
    const uniq = [...new Map(edits.map((e) => [`${e[0]}|${e[1]}`, e])).values()].sort((a, b) => b[0] - a[0] || (a[1] === ')' ? -1 : 1));
    let text = sf.getFullText();
    for (const [pos, ins] of uniq) text = text.slice(0, pos) + ins + text.slice(pos);
    fs.writeFileSync(sf.fileName, text);
    changed += uniq.length;
  }
  console.log(`round ${round + 1}: ${changed} edits`);
  if (!changed) break;
}
for (const r of reports) console.log('MANUAL', r);
