// Tiny expression engine for Bases formulas & filters. Supports dotted identifiers
// (file.name, status), numbers, strings, booleans, arithmetic (+ - * / %), comparisons
// (== != < > <= >=), logical (&& || !), parentheses, and a few functions (lower, upper,
// length, contains, if). Precedence-climbing parser; pure evaluation against a context.

function tokenize(src) {
  const toks = [];
  const re = /\s*(>=|<=|==|!=|&&|\|\||[-+*/%()<>!,]|"[^"]*"|'[^']*'|[0-9]*\.?[0-9]+|[A-Za-z_][\w.]*)/g;
  let m;
  while ((m = re.exec(src))) { if (m[1] != null && m[1] !== '') toks.push(m[1]); if (re.lastIndex <= m.index) re.lastIndex = m.index + 1; }
  return toks;
}

const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

export function parseExpr(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];

  function primary() {
    const t = next();
    if (t === '(') { const e = expr(0); next(); return e; }
    if (t === '!') return { type: 'not', x: primary() };
    if (t === '-') return { type: 'neg', x: primary() };
    if (/^["']/.test(t)) return { type: 'str', v: t.slice(1, -1) };
    if (/^[0-9.]+$/.test(t)) return { type: 'num', v: parseFloat(t) };
    if (t === 'true' || t === 'false') return { type: 'bool', v: t === 'true' };
    // function call?
    if (peek() === '(') { next(); const args = []; if (peek() !== ')') { args.push(expr(0)); while (peek() === ',') { next(); args.push(expr(0)); } } next(); return { type: 'call', name: t, args }; }
    return { type: 'id', name: t };
  }
  function expr(min) {
    let left = primary();
    while (peek() != null && PREC[peek()] != null && PREC[peek()] >= min) {
      const op = next();
      const right = expr(PREC[op] + 1);
      left = { type: 'bin', op, left, right };
    }
    return left;
  }
  return expr(0);
}

function lookup(ctx, name) {
  if (name in ctx) return ctx[name];
  const parts = name.split('.');
  let cur = ctx;
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}

const FUNCS = {
  lower: (s) => String(s ?? '').toLowerCase(),
  upper: (s) => String(s ?? '').toUpperCase(),
  length: (s) => (s == null ? 0 : (s.length ?? String(s).length)),
  contains: (s, sub) => String(s ?? '').includes(String(sub ?? '')),
  if: (c, a, b) => (c ? a : b),
  number: (s) => Number(s),
  round: (n, d = 0) => Math.round(Number(n) * 10 ** d) / 10 ** d,
};

export function evalExpr(ast, ctx) {
  switch (ast.type) {
    case 'num': return ast.v;
    case 'str': return ast.v;
    case 'bool': return ast.v;
    case 'id': return lookup(ctx, ast.name);
    case 'neg': return -evalExpr(ast.x, ctx);
    case 'not': return !evalExpr(ast.x, ctx);
    case 'call': { const fn = FUNCS[ast.name]; return fn ? fn(...ast.args.map((a) => evalExpr(a, ctx))) : undefined; }
    case 'bin': {
      const l = evalExpr(ast.left, ctx), r = evalExpr(ast.right, ctx);
      switch (ast.op) {
        case '+': return typeof l === 'string' || typeof r === 'string' ? String(l ?? '') + String(r ?? '') : l + r;
        case '-': return l - r; case '*': return l * r; case '/': return l / r; case '%': return l % r;
        case '==': return l == r; case '!=': return l != r;
        case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
        case '&&': return l && r; case '||': return l || r;
      }
    }
  }
  return undefined;
}

export function evaluate(src, ctx) { return evalExpr(parseExpr(src), ctx); }
