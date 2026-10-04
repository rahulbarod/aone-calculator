// Understands a spoken new-product line such as
//   "thrust bearing 80 no. 365 rs"      → name, 80 pcs, ₹365 each
//   "copper scrap 2.5 kilo 600 rupees"  → scrap, 2.5 kg, ₹600 per kg
//   "starter 6205 total 1200"           → name keeps "6205", total ₹1,200
// Anything it can't find is left empty for the person to fill or skip.
const UNIT_WORDS = [
  ['PCS', 'pcs|pc|piece|pieces|peace|nos|no|number|numbers|nag|nug|नग|पीस|नंबर|नम्बर'],
  ['KG', 'kg|kgs|kilo|kilos|kilogram|kilograms|किलो'],
  ['GRAM', 'g|gm|gms|gram|grams|ग्राम'],
  ['METER', 'm|mtr|mtrs|meter|meters|metre|metres|मीटर'],
  ['BOX', 'box|boxes|डिब्बा|डब्बा'],
];
const RS = 'rs|rs\\.|rupees|rupee|rupaye|rupaiye|rupya|रुपए|रुपये|रुपया|रु';
const NUM = '(\\d+(?:\\.\\d+)?)';
const FILLER = /\b(at|rate|per|price|of|the|and|ka|ke|ki|ko|hai|है|का|के|की|भाव|each|only|bas|that's it|thats it)\b/g;
const SCRAP = /\b(scrap|kabad|kabaad|bhangar|कबाड़|कबाड|भंगार)\b/i;
const TOTAL = /\b(total|kul|final|कुल|टोटल)\b/i;

const unitOf = word => UNIT_WORDS.find(([, re]) => new RegExp(`^(?:${re})\\.?$`, 'i').test(word))?.[0] || null;

export function parseProductSpeech(input) {
  let t = ` ${String(input || '')} `
    .replace(/[०-९]/g, d => '०१२३४५६७८९'.indexOf(d))
    .replace(/(\d),(\d{3})/g, '$1$2') // 1,200 → 1200
    .replace(/₹\s*/g, ' rs ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const out = { name: '', qty: null, unit: null, price: null, priceMode: 'each', scrap: SCRAP.test(t) };
  if (TOTAL.test(t)) out.priceMode = 'total';
  t = t.replace(TOTAL, ' ');
  const take = re => {
    const m = t.match(re);
    if (m) t = t.replace(m[0], ' ');
    return m;
  };

  // Price: "365 rs", "rs 365", "₹365"
  let m = take(new RegExp(`\\b${NUM}\\s*(?:${RS})(?=\\s|$)`)) || take(new RegExp(`(?:^|\\s)(?:${RS})\\s*${NUM}\\b`));
  if (m) out.price = parseFloat(m[1]);
  // "per kg" / "/kg" after the price tells the unit of the rate
  m = take(/\b(?:per|\/)\s*([a-zऀ-ॿ]+)\b/);
  if (m && unitOf(m[1])) out.unit = unitOf(m[1]);

  // Quantity with a unit word: "80 no.", "2.5 kilo", "3 pcs"
  for (const [unit, words] of UNIT_WORDS) {
    m = take(new RegExp(`\\b${NUM}\\s*(?:${words})\\.?(?=\\s|$)`));
    if (m) {
      out.qty = parseFloat(m[1]);
      out.unit = out.unit || unit;
      break;
    }
  }
  // No "rs" said: a number at the very end is the price ("starter 1200").
  if (out.price == null) {
    m = t.trimEnd().match(new RegExp(`\\s${NUM}$`));
    if (m && t.trim().split(' ').length > 1) {
      out.price = parseFloat(m[1]);
      t = t.trimEnd().slice(0, -m[0].length) + ' ';
    }
  }
  out.name = t
    .replace(FILLER, ' ')
    .replace(new RegExp(`(?:^|\\s)(?:${RS})(?=\\s|$)`, 'g'), ' ')
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toUpperCase());
  return out;
}
