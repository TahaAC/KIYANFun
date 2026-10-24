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
  // Multi-word phrases first (longest-match-first rule)
  [/\bdivided\s+by\b/g, '/'],
  [/\bdivide\s+by\b/g, '/'],
  [/\bmultiply\s+by\b/g, '*'],
  [/\bmultiplied\s+by\b/g, '*'],
  [/\badded\s+to\b/g, '+'],
  [/\bsum\s+of\b/g, '+'],
  [/\btake\s+away\b/g, '-'],
  [/\bsubtract(?:ed)?\b/g, '-'],
  [/\bequal\s+to\b/g, '='],
  [/\bequals\b/g, '='],
  [/\bplus\b/g, '+'],
  [/\badd\b/g, '+'],
  [/\bminus\b/g, '-'],
  [/\bless\b/g, '-'],
  [/\btimes\b/g, '*'],
  [/\bmultiply\b/g, '*'],
  [/\bdivide\b/g, '/'],
  [/\bover\b/g, '/'],
  [/\bdivided\b/g, '/'],
  [/\bmake\b/g, '='],
  [/\bmakes\b/g, '='],
  [/\bequal\b/g, '='],
];

/**
 * Pre-process special mathematical phrases that don't fit the
 * simple word→operator substitution model:
 *   - "square root of X"        → "( X ) ^ 0.5"
 *   - "X squared"               → "X ^ 2"
 *   - "X cubed"                 → "X ^ 3"
 *   - "X to the power of Y"     → "X ^ Y"
 *   - "X raised to the Y"       → "X ^ Y"
 *
 * MUST run AFTER replaceOperators() so all standard operator words
 * have already become symbols (+, -, *, /, =). The lookaheads detect
 * operator boundaries with `(?=\s*[+*\/^=()]|$)` — the `\s*` lets the
 * boundary sit after optional whitespace, so multi-word numbers like
 * "twenty five" don't break on the internal space.
 */
function preprocessSpecials(input: string): string {
  let t = ' ' + input.toLowerCase() + ' ';

  // "square root of X" / "sqrt of X" / "root of X"
  // X is captured up to the next operator or end-of-string.
  const rootRe = /\b(?:square\s+root|sqrt|root)\s+of\s+([a-z0-9\s]+?)(?=\s*[+*/^=()]|$)/g;
  t = t.replace(rootRe, ' ( $1 ) ^ 0.5 ');

  // "X to the power of Y" / "X power of Y" / "X raised to the Y"
  t = t.replace(/\bto\s+the\s+power\s+of\b/g, ' ^ ');
  t = t.replace(/\braised\s+to\s+the\b/g, ' ^ ');
  t = t.replace(/\bpower\s+of\b/g, ' ^ ');

  // Postfix: "X squared" → "X ^ 2", "X cubed" → "X ^ 3"
  t = t.replace(/\bsquared\b/g, ' ^ 2 ');
  t = t.replace(/\bcubed\b/g, ' ^ 3 ');

  return t;
}

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
 * Splits on whitespace and operator symbols (including `^` for powers
 * and parentheses).
 */
function tokenise(text: string): string[] {
  return text
    .split(/(\s+|[+\-*/^=()])/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Convert a run of number words into a single number.
 *  Supports "and" (ignored) and "point" (decimal separator):
 *    ["one","hundred","and","fifty"]      → 150
 *    ["three","point","one","four"]        → 3.14
 *    ["two","point","five"]                → 2.5
 */
function wordsToNumber(words: string[]): number | null {
  if (words.length === 0) return null;

  // Handle decimals: "X point Y Z W" → integer part + fractional digits
  const pointIdx = words.indexOf('point');
  if (pointIdx !== -1) {
    const intWords = words.slice(0, pointIdx);
    const fracWords = words.slice(pointIdx + 1);
    let intVal: number | null = 0;
    if (intWords.length > 0) {
      intVal = wordsToNumber(intWords);
      if (intVal === null) return null;
    }
    let fracStr = '';
    for (const raw of fracWords) {
      const w = raw.replace(/[^a-z]/g, '');
      if (!(w in NUMBER_WORDS)) return null;
      const v = NUMBER_WORDS[w];
      if (v >= 10) return null; // "ten" can't appear in a fractional part
      fracStr += v;
    }
    if (fracStr.length === 0) return null;
    return parseFloat(`${intVal}.${fracStr}`);
  }

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

/** Shunting-yard evaluator — safe replacement for eval().
 *  Supports +, -, *, /, ^ (power, right-associative), and parentheses.
 */
function safeEval(expression: string): number {
  const tokens = expression.match(/(\d+(?:\.\d+)?)|[+\-*/^()]/g);
  if (!tokens || tokens.length === 0) throw new Error('Empty expression');

  const output: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  const rightAssoc: Record<string, boolean> = { '^': true };

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
      while (ops.length && ops[ops.length - 1] !== '(') {
        const topOp = ops[ops.length - 1] as string;
        const topPrec = prec[topOp];
        const curPrec = prec[t];
        // Right-associative: pop only when top has strictly higher precedence.
        // Left-associative (default): pop when top has >= precedence.
        const shouldPop = rightAssoc[t]
          ? topPrec > curPrec
          : topPrec >= curPrec;
        if (shouldPop) {
          output.push(ops.pop() as string);
        } else {
          break;
        }
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
        case '^':
          r = Math.pow(a, b);
          if (!isFinite(r)) return NaN;
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

  // Replace operator words with symbols FIRST, so the special-phrase
  // lookaheads in preprocessSpecials can detect operator boundaries
  // (via `(?=\s*[+*/^=()]|$)`) instead of breaking on internal
  // whitespace inside multi-word numbers like "twenty five".
  text = replaceOperators(text);

  // Then handle special phrases (square root, squared, cubed, power of).
  text = preprocessSpecials(text);

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
    if (/^[+\-*/^=()]$/.test(token)) {
      flushNumber();
      exprTokens.push(token);
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      flushNumber();
      exprTokens.push(token);
      continue;
    }
    const cleaned = token.replace(/[^a-z]/g, '');
    if (cleaned in NUMBER_WORDS) {
      numberBuffer.push(cleaned);
      continue;
    }
    // "and" inside a number phrase (e.g. "one hundred and fifty")
    // is silently skipped so the surrounding numbers still combine.
    if (cleaned === 'and') {
      continue;
    }
    // "point" begins a decimal — push to buffer; wordsToNumber handles it.
    if (cleaned === 'point') {
      numberBuffer.push('point');
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

/** Speak a sentence using the browser's speech synthesis.
 *  Utterances are queued (not cancelled) so back-to-back messages like a
 *  result followed by a streak celebration play in order. */
export function speak(text: string, opts?: { rate?: number; pitch?: number }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
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

const NUM_WORDS_UNDER_100: string[] = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS: string[] = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
];

/** Convert a non-negative integer (up to 999,999) to spoken English words. */
export function numberToWords(n: number): string {
  if (n < 0) return 'negative ' + numberToWords(-n);
  if (n < 20) return NUM_WORDS_UNDER_100[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r === 0 ? TENS[t] : `${TENS[t]} ${NUM_WORDS_UNDER_100[r]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? `${NUM_WORDS_UNDER_100[h]} hundred` : `${NUM_WORDS_UNDER_100[h]} hundred ${numberToWords(r)}`;
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    return r === 0 ? `${numberToWords(th)} thousand` : `${numberToWords(th)} thousand ${numberToWords(r)}`;
  }
  return String(n);
}

/** Speak a decimal number: 3.14 → "three point one four". */
export function speakDecimal(n: number): string {
  const s = String(n);
  if (!s.includes('.')) return numberToWords(n);
  const [intPart, fracPart] = s.split('.');
  const intWords = parseInt(intPart, 10) === 0 ? 'zero' : numberToWords(parseInt(intPart, 10));
  const fracWords = fracPart
    .split('')
    .map((d) => NUM_WORDS_UNDER_100[parseInt(d, 10)])
    .join(' ');
  return `${intWords} point ${fracWords}`;
}

/** Speak any number: integers via numberToWords, decimals via speakDecimal. */
export function speakNumber(n: number): string {
  if (Number.isInteger(n)) return numberToWords(n);
  return speakDecimal(n);
}

/**
 * Convert a pretty-printed expression like "5 + 3 × 2" or "2 ^ 3 ÷ 4"
 * into fully-spoken words: "five plus three times two".
 * Every digit run is converted to words so TTS never reads "5" as
 * the bare digit "five" inconsistently across voices.
 */
export function speakExpression(expression: string): string {
  return expression
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/−/g, ' minus ')
    .replace(/\+/g, ' plus ')
    .replace(/\^/g, ' to the power of ')
    .replace(/\(/g, ' open parenthesis ')
    .replace(/\)/g, ' close parenthesis ')
    .replace(/(\d+(?:\.\d+)?)/g, (m) => ` ${speakNumber(parseFloat(m))} `)
    .replace(/\s+/g, ' ')
    .trim();
}
