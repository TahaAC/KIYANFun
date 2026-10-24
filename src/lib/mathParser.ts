// Spoken-math parser for the KIYAN app.
// Converts kid-friendly spoken phrases like "five plus three" or
// "twenty divided by four" into a real mathematical expression and
// computes the result safely (no eval()).

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40, // common misspeak
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

const OPERATOR_WORDS: [RegExp, string][] = [
  [/\bdivided\s+by\b/g, '/'],
  [/\bdivide\s+by\b/g, '/'],
  [/\bmultiply\s+by\b/g, '*'],
  [/\btake\s+away\b/g, '-'],
  [/\bequal\s+to\b/g, '='],
  [/\bequals\b/g, '='],
  [/\bequal\b/g, '='],
  [/\bplus\b/g, '+'],
  [/\badd\b/g, '+'],
  [/\badded\s+to\b/g, '+'],
  [/\bsum\s+of\b/g, '+'],
  [/\bminus\b/g, '-'],
  [/\bsubtract(?:ed)?\b/g, '-'],
  [/\bless\b/g, '-'],
  [/\btimes\b/g, '*'],
  [/\bmultiply\b/g, '*'],
  [/\bmultiplied\s+by\b/g, '*'],
  [/\bdivide\b/g, '/'],
  [/\bover\b/g, '/'],
  [/\bdivided\b/g, '/'],
  [/\bmake\b/g, '='],
  [/\bmakes\b/g, '='],
];

// Repeated digit words (e.g. "double four", "triple nine") — bonus fun.
const MULTIPLIER_PREFIX: Record<string, number> = {
  double: 2,
  triple: 3,
  twice: 2,
};

export interface ParseResult {
  expression: string; // e.g. "5 + 3"
  result: number | null;
  spokenInput: string;
  error?: string;
  isInteger?: boolean;
}

/** Replace spoken operator words with symbol operators. */
function replaceOperators(text: string): string {
  let t = text;
  for (const [pattern, sym] of OPERATOR_WORDS) {
    t = t.replace(pattern, ` ${sym} `);
  }
  return t;
}

/**
 * Tokenise a normalised string into word/number/operator chunks.
 * Splits on whitespace and operator symbols.
 */
function tokenise(text: string): string[] {
  return text
    .split(/(\s+|[+\-*/=()])/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Convert a run of number words into a single integer. */
function wordsToNumber(words: string[]): number | null {
  if (words.length === 0) return null;
  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const raw of words) {
    const word = raw.replace(/[^a-z]/g, '');
    if (!(word in NUMBER_WORDS)) return null;
    const val = NUMBER_WORDS[word];

    if (word === 'hundred' || word === 'thousand') {
      const base = current === 0 ? 1 : current;
      current = base * val;
    } else {
      current += val;
    }
    sawNumber = true;
  }

  total += current;
  return sawNumber ? total : null;
}

/** Shunting-yard evaluator — safe replacement for eval(). */
function safeEval(expression: string): number {
  const tokens = expression.match(/(\d+(?:\.\d+)?)|[+\-*/()]/g);
  if (!tokens || tokens.length === 0) throw new Error('Empty expression');

  const output: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

  let prevToken: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];

    // Handle unary minus / plus by injecting a 0.
    const isOperator = t in prec;
    const isPrevOperatorOrStart =
      prevToken === null ||
      prevToken === '(' ||
      prevToken in prec;
    if (isOperator && isPrevOperatorOrStart) {
      if (t === '-' || t === '+') {
        output.push(0);
      } else {
        throw new Error('Invalid operator position');
      }
    }

    if (/^\d/.test(t)) {
      output.push(parseFloat(t));
    } else if (t in prec) {
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        prec[ops[ops.length - 1]] >= prec[t]
      ) {
        output.push(ops.pop() as string);
      }
      ops.push(t);
    } else if (t === '(') {
      ops.push(t);
    } else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        output.push(ops.pop() as string);
      }
      if (!ops.length) throw new Error('Mismatched parentheses');
      ops.pop();
    } else {
      throw new Error('Unknown token: ' + t);
    }
    prevToken = t;
  }

  while (ops.length) {
    const op = ops.pop() as string;
    if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
    output.push(op);
  }

  const stack: number[] = [];
  for (const t of output) {
    if (typeof t === 'number') {
      stack.push(t);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('Malformed');
      let r: number;
      switch (t) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) return NaN;
          r = a / b;
          break;
        default: throw new Error('Unknown operator');
      }
      stack.push(r);
    }
  }
  if (stack.length !== 1) throw new Error('Malformed expression');
  return stack[0];
}

/**
 * Convert a digit (0-9) string to its display symbol using a math-shaped
 * variant so kids can see numbers as friendly characters.
 */
export function operatorSymbol(sym: string): string {
  switch (sym) {
    case '+': return '+';
    case '-': return '−';
    case '*': return '×';
    case '/': return '÷';
    case '=': return '=';
    default: return sym;
  }
}

/** Pretty-print the expression for display. */
export function prettyExpression(rawExpression: string): string {
  return rawExpression
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/-/g, '−');
}

/**
 * Main entry point. Accepts a kid-friendly spoken phrase and returns
 * the parsed expression and computed result.
 */
export function parseSpokenMath(input: string): ParseResult {
  const spokenInput = input.trim();
  if (!spokenInput) {
    return { expression: '', result: null, spokenInput, error: 'Say something!' };
  }

  // Apply multiplier prefixes ("double four" -> "4 + 4")
  let text = ' ' + spokenInput.toLowerCase() + ' ';
  for (const [word, mult] of Object.entries(MULTIPLIER_PREFIX)) {
    const re = new RegExp(`\\b${word}\\s+([a-z\\s]+?)(?=[\\s+\\-*/=]|$)`, 'g');
    text = text.replace(re, (_m, rest: string) => {
      const tokens = rest.trim().split(/\s+/);
      const joined = tokens.join(' ');
      return Array(mult).fill(joined).join(' + ');
    });
  }

  // Replace operator words with symbols.
  text = replaceOperators(text);

  // Tokenise.
  const tokens = tokenise(text);

  // Walk through tokens, grouping consecutive number-words into digits.
  const exprTokens: string[] = [];
  let numberBuffer: string[] = [];

  const flushNumber = () => {
    if (numberBuffer.length === 0) return;
    const num = wordsToNumber(numberBuffer);
    if (num === null) {
      // Unknown word inside a number run — ignore those tokens.
      numberBuffer = [];
      return;
    }
    exprTokens.push(String(num));
    numberBuffer = [];
  };

  for (const token of tokens) {
    if (/^[+\-*/=()]$/.test(token)) {
      flushNumber();
      exprTokens.push(token);
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(token)) {
      flushNumber();
      exprTokens.push(token);
      continue;
    }
    const cleaned = token.replace(/[^a-z]/g, '');
    if (cleaned in NUMBER_WORDS) {
      numberBuffer.push(cleaned);
      continue;
    }
    // Unknown word — flush and skip (kids will say "um", "uh", etc.)
    flushNumber();
  }
  flushNumber();

  if (exprTokens.length === 0) {
    return {
      expression: '',
      result: null,
      spokenInput,
      error: "I didn't hear a number!",
    };
  }

  // Strip trailing '=' if present.
  let expr = exprTokens.join(' ').replace(/\s*=\s*$/, '').trim();

  // Validate ends: must start and end with a number or paren.
  if (!/\d$/.test(expr) && !/\)$/.test(expr)) {
    return {
      expression: prettyExpression(expr),
      result: null,
      spokenInput,
      error: 'Hmm, that ends with an operator!',
    };
  }

  let result: number;
  try {
    result = safeEval(expr);
  } catch (e) {
    return {
      expression: prettyExpression(expr),
      result: null,
      spokenInput,
      error: 'I could not compute that — try again!',
    };
  }

  if (!isFinite(result) || isNaN(result)) {
    return {
      expression: prettyExpression(expr),
      result: null,
      spokenInput,
      error: 'That is too tricky for me!',
    };
  }

  return {
    expression: prettyExpression(expr),
    result,
    spokenInput,
    isInteger: Number.isInteger(result),
  };
}

/** Speak a sentence using the browser's speech synthesis. */
export function speak(text: string, opts?: { rate?: number; pitch?: number }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts?.rate ?? 0.95;
    utter.pitch = opts?.pitch ?? 1.2;
    // Prefer a friendly English voice if available.
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en[-_]GB/i.test(v.lang) && /female|kid|child/i.test(v.name)) ||
      voices.find((v) => /en[-_]US/i.test(v.lang) && /female|kid|child/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore */
  }
}
