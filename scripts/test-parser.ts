// Quick smoke test for the spoken-math parser. Run with:
//   npx tsx scripts/test-parser.ts
//
// Verifies that parseSpokenMath() handles the new cases:
//   - "and" inside multi-word numbers
//   - "point" decimals
//   - powers / squared / cubed / square root of
//   - chained expressions
//   - existing simple cases still work

import { parseSpokenMath, speakExpression, speakNumber } from '../src/lib/mathParser';

const CASES: Array<[string, number | string]> = [
  // Existing simple cases (must not regress)
  ['five plus three', 8],
  ['ten minus four', 6],
  ['six times seven', 42],
  ['twenty divided by four', 5],
  ['one hundred plus fifty', 150],

  // "and" support
  ['one hundred and fifty', 150],
  ['two hundred and thirty four', 234],
  ['one hundred and fifty minus seventy five', 75],

  // decimals via "point"
  ['three point one four', 3.14],
  ['two point five plus one point five', 4],

  // powers
  ['two to the power of three', 8],
  ['five squared', 25],
  ['two cubed', 8],
  ['three to the power of two', 9],

  // square root
  ['square root of sixteen', 4],
  ['square root of twenty five', 5],
  ['square root of one hundred', 10],
  ['square root of one hundred and forty four', 12],

  // chained / mixed precedence
  ['five plus three times two', 11],
  ['ten plus five minus three', 12],
  ['one hundred divided by two plus five', 55],

  // multi-step
  ['two plus two plus two plus two', 8],
  ['one thousand minus one hundred', 900],

  // large numbers (million / billion support + correct scale-accumulation)
  ['three million', 3_000_000],
  ['two thousand three hundred', 2_300],
  ['three million two hundred thousand', 3_200_000],
  ['one million two hundred thirty four thousand five hundred sixty seven', 1_234_567],
  ['nine hundred and ninety nine', 999],
  ['one thousand and twenty four', 1_024],
];

let pass = 0;
let fail = 0;

console.log('--- parseSpokenMath ---');
for (const [input, expected] of CASES) {
  const r = parseSpokenMath(input);
  const ok = r.result === expected;
  if (ok) pass++; else fail++;
  console.log(
    `${ok ? '✓' : '✗'}  "${input}"  →  ${r.expression} = ${r.result}` +
    (ok ? '' : `   [expected ${expected}]`)
  );
}

console.log('\n--- speakExpression / speakNumber (TTS preview) ---');
const speakCases = [
  ['5 + 3', 'five plus three'],
  ['2 ^ 3', 'two to the power of three'],
  ['10 ÷ 4', 'ten divided by four'],
  ['25 − 7', 'twenty five minus seven'],
  ['( 16 ) ^ 0.5', 'open parenthesis sixteen close parenthesis to the power of zero point five'],
];
for (const [expr, expected] of speakCases) {
  const spoken = speakExpression(expr);
  const ok = spoken === expected;
  if (ok) pass++; else fail++;
  console.log(
    `${ok ? '✓' : '✗'}  "${expr}"  →  "${spoken}"` +
    (ok ? '' : `   [expected "${expected}"]`)
  );
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
