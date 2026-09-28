// Fails when a Promise is dropped or used as a truth value. A forgotten `await` on a DB write inside tx()
// would let the transaction commit before the write runs, so this check runs with the tests.
// Usage: node tools/check-floating.mjs [tsconfig dir]
import path from 'node:path';
import ts from 'typescript';

const dir = process.argv[2] ?? '.';
const cfgPath = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, path.dirname(cfgPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const isPromise = (t) => {
  if (!t) return false;
  if (t.isUnion()) return t.types.some(isPromise);
  return (t.getSymbol() ?? t.aliasSymbol)?.getName() === 'Promise';
};
const problems = [];
const at = (sf, n, msg) => problems.push(`${path.relative(process.cwd(), sf.fileName)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${msg}: ${n.getText(sf).slice(0, 80)}`);

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
  const visit = (n) => {
    if (ts.isExpressionStatement(n)) {
      const e = n.expression;
      const assignment = ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      const testApi = ts.isCallExpression(e) && ts.isIdentifier(e.expression) && ['describe', 'it', 'test'].includes(e.expression.text); // node:test queues these itself
      if (!testApi && !assignment && !ts.isVoidExpression(e) && !ts.isAwaitExpression(e) && isPromise(checker.getTypeAtLocation(e))) at(sf, e, 'floating promise');
    }
    const cond = ts.isIfStatement(n) || ts.isWhileStatement(n) || ts.isConditionalExpression(n) ? n.condition ?? n.expression
      : ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken ? n.operand
      : ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind) ? n.left : null;
    if (cond && isPromise(checker.getTypeAtLocation(cond))) at(sf, cond, 'promise used as a value in a condition');
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['forEach', 'filter', 'find', 'some', 'every'].includes(n.expression.name.text)) {
      const cb = n.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && isPromise(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(cb)))) at(sf, n, `async callback in .${n.expression.name.text}()`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} promise problem(s).`); process.exit(1); }
console.log('no floating promises');
