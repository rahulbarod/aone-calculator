import { cloud } from './cloud.js';
import { db as legacyDb } from './db.js';
import { voice } from './voice.js';
import { scale } from './scale.js';
import { parseProductSpeech } from './parse.js';
import { startHindi } from './i18n.js';

const APP_VERSION = '3.2.0';

// ---------------------------------------------------------------- constants
const UNITS = {
  KG: { label: 'kg', name: 'KG', decimal: true },
  GRAM: { label: 'g', name: 'GRAM', decimal: true },
  PCS: { label: 'pcs', name: 'PCS', decimal: false },
  BOX: { label: 'box', name: 'BOX', decimal: false },
  METER: { label: 'm', name: 'METER', decimal: true },
  OTHER: { label: 'unit', name: 'OTHER', decimal: true },
  UNSET: { label: '', name: '— NOT SET —', decimal: true }, // quick-added, to be completed later
};
const PRICE_TYPES = {
  PER_KG: { label: 'Per kg', per: 'kg' },
  PER_GRAM: { label: 'Per gram', per: 'g' },
  PER_PIECE: { label: 'Per piece', per: 'pc' },
  PER_BOX: { label: 'Per box', per: 'box' },
  PER_METER: { label: 'Per meter', per: 'm' },
  FIXED: { label: 'Fixed', per: '' },
  UNSET: { label: '— Not set —', per: '' },
};
const UNIT_PRICE_TYPE = { KG: 'PER_KG', GRAM: 'PER_GRAM', PCS: 'PER_PIECE', BOX: 'PER_BOX', METER: 'PER_METER', OTHER: 'FIXED', UNSET: 'UNSET' };
const CATEGORIES = { WEIGHT: 'Weight based', PIECE: 'Piece based', SCRAP: 'Scrap', OTHER: 'Other' };
const CATEGORY_UNIT = { WEIGHT: 'KG', PIECE: 'PCS', SCRAP: 'KG', OTHER: 'PCS' };
const VOICE_LANGS = {
  'en-IN': 'English (India)', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'pa-IN': 'Punjabi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada',
};
// Shared by both phones (stored in the cloud).
const DEFAULT_SHOP = { shopName: 'A ONE ENTERPRISE', shopAddress: '', shopPhone: '', showTodaySales: true };
const RECENT_DAYS = 45; // bills older than this load on demand in History

// Starting catalogue. Prices other than those in the brief are placeholders.
const SAMPLE_PRODUCTS = [
  ['Copper Wire', 'WEIGHT', 'KG', 900, true, 42.5],
  ['Aluminium Wire', 'WEIGHT', 'KG', 280, false, null],
  ['Copper Sheet', 'WEIGHT', 'KG', 950, false, null],
  ['Other (by kg)', 'WEIGHT', 'KG', 0, false, null],
  ['Bush', 'PIECE', 'PCS', 120, true, 87],
  ['Bearing', 'PIECE', 'PCS', 250, true, 32],
  ['Oil Seal', 'PIECE', 'PCS', 80, true, null],
  ['Impeller', 'PIECE', 'PCS', 450, false, null],
  ['Starter', 'PIECE', 'PCS', 850, true, null],
  ['Capacitor', 'PIECE', 'PCS', 180, false, null],
  ['Mechanical Seal', 'PIECE', 'PCS', 350, false, null],
  ['Other Part', 'OTHER', 'PCS', 0, false, null],
  ['Copper Scrap', 'SCRAP', 'KG', -600, true, null],
  ['Aluminium Scrap', 'SCRAP', 'KG', -150, false, null],
  ['Old Motor Scrap', 'SCRAP', 'KG', -40, false, null],
  ['Other Scrap', 'SCRAP', 'KG', 0, false, null],
];

// ---------------------------------------------------------------- state
const S = {
  user: undefined, // undefined = still checking, null = signed out
  denied: false,
  products: [], customers: [], bills: [], olderBills: [], bundles: [],
  shop: { ...DEFAULT_SHOP }, counters: {},
  loaded: {}, fromServer: {}, pending: {},
  legacy: null, // data saved on this phone by v1 (before sync)
};
window.AOne = { S, cloud, scale }; // handy for debugging in DevTools

// Per-phone preferences (not synced).
const local = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem('aone.' + key);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('aone.' + key, JSON.stringify(value));
    } catch { /* private mode */ }
  },
};

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const round2 = n => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;
const round3 = n => Math.sign(n) * Math.round(Math.abs(n) * 1000 + 1e-9) / 1000;
const num = v => parseFloat(String(v ?? '').replace(/,/g, '.').replace(/[^0-9.\-]/g, ''));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const recentCutoff = () => new Date(Date.now() - RECENT_DAYS * 864e5).toISOString();

function money(n) {
  const frac = Math.abs(n) % 1 > 0.0001;
  const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  return (n < 0 ? '-₹' : '₹') + s;
}
function fmtQty(q, unit) {
  return q.toLocaleString('en-IN', { minimumFractionDigits: unit === 'KG' ? 2 : 0, maximumFractionDigits: 3 });
}
function unitLabel(unit, q) {
  if (unit === 'PCS') return q === 1 ? 'pc' : 'pcs';
  return UNITS[unit]?.label ?? '';
}
function rateText(rate, priceType) {
  const per = PRICE_TYPES[priceType]?.per;
  return money(rate) + (per ? ` / ${per}` : '');
}
function qtyWord(unit) {
  return unit === 'KG' || unit === 'GRAM' ? 'WEIGHT' : unit === 'METER' ? 'LENGTH' : 'QUANTITY';
}
// Amount for one line. Handles kg↔gram mismatches between unit and price type.
function lineAmount(qty, rate, unit, priceType) {
  let q = qty;
  if (unit === 'KG' && priceType === 'PER_GRAM') q = qty * 1000;
  if (unit === 'GRAM' && priceType === 'PER_KG') q = qty / 1000;
  return round2(q * rate);
}
function lineCalcText(it, plainRate = false) {
  return `${[fmtQty(it.quantity, it.unit), unitLabel(it.unit, it.quantity)].filter(Boolean).join(' ')} × ${money(plainRate ? Math.abs(it.rate) : it.rate)}`;
}
// The shop's bill layout: purchases first with their own total, then the
// scrap taken from the customer (deducted), then the final amount.
function billSections(b) {
  const sales = b.items.filter(i => i.amount >= 0);
  const scrap = b.items.filter(i => i.amount < 0);
  const sum = list => round2(list.reduce((s, i) => s + i.amount, 0));
  return { sales, scrap, salesTotal: sum(sales), scrapTotal: sum(scrap) };
}
const finalLabel = b => (b.total < 0 ? 'PAY TO CUSTOMER' : b.items.some(i => i.amount < 0) ? 'AMOUNT TO PAY' : 'TOTAL');
// Products added quickly while billing stay flagged until someone fills in the gaps.
function missingInfo(p) {
  if (!p.needsReview) return [];
  const m = [];
  if (p.unit === 'UNSET') m.push('unit');
  if (!p.price) m.push('price');
  return m;
}
const isIncomplete = p => missingInfo(p).length > 0;
const fmtDate = iso => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), kind === 'err' ? 4000 : 2000);
}

// ---------------------------------------------------------------- lookups
const allBills = () => [...S.bills, ...S.olderBills.filter(o => !S.bills.some(b => b.id === o.id))];
const getBill = id => allBills().find(b => b.id === id);
const getProduct = id => S.products.find(p => p.id === id);
const getCustomer = id => S.customers.find(c => c.id === id);
// Bills opened with "Add to bill" but never given a customer or item are hidden.
const isEmptyDraft = b => b.status === 'DRAFT' && !b.customerChosen && !b.items.length;
const activeBills = () => S.bills
  .filter(b => b.status === 'ACTIVE' || (b.status === 'DRAFT' && !isEmptyDraft(b)))
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const billLabel = b => `#${b.device ? b.device + '-' : ''}${b.billNo}`;
const billName = b => b.customerName || (b.customerChosen ? `Walk-in ${billLabel(b)}` : `New bill ${billLabel(b)}`);

function searchCustomers(q) {
  const s = q.trim().toLowerCase();
  const list = s
    ? S.customers.filter(c => c.name.toLowerCase().includes(s) || (c.phone || '').includes(s))
    : [...S.customers];
  return list.sort((a, b) =>
    (s ? (b.name.toLowerCase().startsWith(s) - a.name.toLowerCase().startsWith(s)) : 0) ||
    (b.lastBilledAt || '').localeCompare(a.lastBilledAt || '') ||
    a.name.localeCompare(b.name));
}
function searchProducts(list, q) {
  const s = q.trim().toLowerCase();
  return list
    .filter(p => p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s))
    .sort((a, b) => (b.name.toLowerCase().startsWith(s) - a.name.toLowerCase().startsWith(s)) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- data model ops
function makeProduct(f) {
  const unit = f.unit || CATEGORY_UNIT[f.category] || 'PCS';
  return {
    id: uid(), name: f.name, category: f.category || 'OTHER', unit,
    priceType: f.priceType || UNIT_PRICE_TYPE[unit], price: f.price ?? 0, isNegative: (f.price ?? 0) < 0,
    sku: f.sku || '', allowDecimal: f.allowDecimal ?? UNITS[unit].decimal,
    favourite: !!f.favourite, active: f.active ?? true,
    stock: f.stock ?? null, minStock: f.minStock ?? null,
    createdAt: now(), updatedAt: now(),
  };
}
function sampleToProduct([name, category, unit, price, favourite, stock]) {
  return makeProduct({ name, category, unit, price, favourite, stock, minStock: stock != null ? 10 : null });
}

// Bills are stored with items and payments as maps (see cloud.js); the app uses arrays.
const byTime = key => (x, y) => (x[key] || '').localeCompare(y[key] || '');
function billFromDoc(d) {
  const list = v => (Array.isArray(v) ? v : Object.values(v || {}));
  const b = {
    ...d,
    items: list(d.items).sort(byTime('addedAt')),
    payments: list(d.payments).sort(byTime('at')),
    // Bills completed before payment tracking existed count as paid.
    legacyPaid: d.status === 'COMPLETED' && !('settled' in d),
  };
  recalc(b, false);
  return b;
}
function billToDoc(b) {
  const { legacyPaid, ...rest } = b;
  return { ...rest, items: Object.fromEntries(b.items.map(i => [i.id, i])), payments: Object.fromEntries((b.payments || []).map(p => [p.id, p])) };
}
function recalc(b, touch = true) {
  b.subtotal = round2(b.items.reduce((s, i) => s + i.amount, 0));
  b.total = b.subtotal; // room for discount / GST later
  b.payments = b.payments || [];
  b.paid = b.legacyPaid ? b.total : round2(b.payments.reduce((s, p) => s + p.amount, 0));
  b.balance = round2(b.total - b.paid);
  // A wire bundle still with the customer means the bill isn't finished.
  b.wireOut = b.items.some(i => i.pending);
  b.isSettled = Math.abs(b.balance) < 0.005 && !b.wireOut;
  if (touch) b.updatedAt = now();
}
// Bills changed on this phone in the last few seconds: a sync update that is
// older than our own change must not overwrite it on screen.
const localWrites = new Map();
const totalsOf = b => {
  localWrites.set(b.id, Date.now());
  recalc(b);
  return { subtotal: b.subtotal, total: b.total, updatedAt: b.updatedAt };
};
const payStateOf = b => {
  localWrites.set(b.id, Date.now());
  recalc(b);
  return { paid: b.paid, balance: b.balance, settled: b.isSettled, settledAt: b.isSettled ? (b.settledAt || now()) : null, updatedAt: b.updatedAt };
};
function updateBill(b, fields) {
  Object.assign(b, fields);
  cloud.update('bills', b.id, { ...fields, ...totalsOf(b) });
}
function putBillItem(b, item, fields = {}) {
  const i = b.items.findIndex(x => x.id === item.id);
  if (i >= 0) b.items[i] = item;
  else b.items.push(item);
  Object.assign(b, fields);
  cloud.setBillEntry(b.id, 'items', item, { ...fields, ...totalsOf(b) });
}
function dropBillItem(b, itemId) {
  b.items = b.items.filter(i => i.id !== itemId);
  cloud.removeBillEntry(b.id, 'items', itemId, totalsOf(b));
}
// amount > 0 = money received; < 0 = money paid out (scrap worth more than the purchase).
function addPayment(b, amount, method, itemIds = null) {
  const p = { id: uid(), amount: round2(amount), method, at: now(), by: S.user.email, ...(itemIds?.length ? { itemIds } : {}) };
  b.payments = [...(b.payments || []), p];
  cloud.setBillEntry(b.id, 'payments', p, payStateOf(b));
  return p;
}
// Item-level PAID / DUE, shown once any payment on the bill names its items.
const paidItemIds = b => new Set((b.payments || []).flatMap(p => p.itemIds || []));
function itemPayTag(b, it) {
  if (b.status !== 'COMPLETED' || b.isSettled || bundleNoCharge(it) || !(b.payments || []).some(p => p.itemIds)) return '';
  return paidItemIds(b).has(it.id) ? 'PAID' : 'DUE';
}
// Wire size (e.g. 1.0, 0.9, 1.3): asked for wire products and shown with the name.
const DEFAULT_SIZES = ['0.5', '0.6', '0.7', '0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5'];
// Products that come in sizes / brands / materials, each with its own price.
const VAR_ATTRS = [['size', 'SIZE'], ['brand', 'BRAND'], ['material', 'MATERIAL']];
const hasVariants = p => !!p?.variantsOn && (p.variants || []).length > 0;
const variantLabel = v => [v.size, v.brand, v.material].filter(Boolean).join(' · ');
const variantMatches = (p, sel) => p.variants.filter(v => VAR_ATTRS.every(([k]) => !sel[k] || (v[k] || '') === sel[k]));
// Fills in any choice that has only one possible value left; returns the variant once it is clear.
function settleVariant(p, sel) {
  for (let changed = true; changed;) {
    changed = false;
    for (const [k] of VAR_ATTRS) {
      if (sel[k]) continue;
      const vals = [...new Set(variantMatches(p, sel).map(v => v[k] || ''))];
      if (vals.length === 1 && vals[0]) {
        sel[k] = vals[0];
        changed = true;
      }
    }
  }
  const m = variantMatches(p, sel);
  return m.length === 1 ? m[0] : null;
}
function chooseVariant(p, sel, k, val) {
  sel[k] = sel[k] === val ? '' : val;
  for (const [o] of VAR_ATTRS) if (o !== k && sel[o] && !variantMatches(p, sel).length) sel[o] = '';
  return settleVariant(p, sel);
}
function variantPicker(p, sel, act) {
  return VAR_ATTRS.filter(([k]) => p.variants.some(v => v[k])).map(([k, label]) => {
    const vals = [...new Set(variantMatches(p, { ...sel, [k]: '' }).map(v => v[k]).filter(Boolean))]
      .sort((a, b) => num(a) - num(b) || a.localeCompare(b));
    return `<label class="lbl">${label}</label><div class="size-chips">${vals.map(x => `<button type="button" class="pchip ${sel[k] === x ? 'on' : ''}" data-act="${act}" data-k="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  }).join('');
}
function variantPrices(p) {
  const ps = p.variants.map(v => v.price).filter(Boolean);
  if (!ps.length) return 'At billing';
  const lo = Math.min(...ps.map(Math.abs));
  const hi = Math.max(...ps.map(Math.abs));
  const per = PRICE_TYPES[p.priceType]?.per;
  return `${money(lo)}${hi > lo ? '–' + money(hi).slice(1) : ''}${per ? ' / ' + per : ''}`;
}
const asksSize = p => !!p && !hasVariants(p) && (p.hasSize ?? /wire|वायर|तार/i.test(p.name));
const sizesFor = p => [...new Set([...DEFAULT_SIZES, ...(p?.sizes || [])])].sort((a, b) => num(a) - num(b));
const normSize = v => {
  const n = num(v);
  return isNaN(n) || n <= 0 ? '' : Number.isInteger(n) ? n.toFixed(1) : String(n);
};
const withSize = (name, size) => (size ? `${name} · ${size}` : name);
const itemTitle = it => withSize(it.productName, it.variant || it.size);
const bundleTitle = bd => withSize(bd.productName, bd.variant || bd.size);
function rememberSize(p, size) {
  if (!p || !size || sizesFor(p).includes(size)) return;
  p.sizes = [...(p.sizes || []), size];
  cloud.update('products', p.id, { sizes: p.sizes, updatedAt: now() });
}
function sizePicker(p, current, act, inputId) {
  const list = sizesFor(p);
  return `<label class="lbl">WIRE SIZE</label>
    <div class="size-chips">${list.map(z => `<button type="button" class="pchip ${z === current ? 'on' : ''}" data-act="${act}" data-s="${z}">${z}</button>`).join('')}</div>
    <input id="${inputId}" class="input big" inputmode="decimal" autocomplete="off" placeholder="Other size" value="${current && !list.includes(current) ? esc(current) : ''}">`;
}
const itemNames = (b, ids) => (ids || []).map(id => b.items.find(i => i.id === id)).filter(Boolean).map(itemTitle).join(', ');
const payLine = (b, p) => `${p.amount < 0 ? 'Paid out' : 'Paid'} ${money(Math.abs(p.amount))} · ${fmtDate(p.at)}, ${fmtTime(p.at)}${p.method ? ' · ' + p.method : ''}${p.itemIds ? ' · for: ' + itemNames(b, p.itemIds) : ''}`;
function removePayment(b, paymentId) {
  b.payments = b.payments.filter(p => p.id !== paymentId);
  cloud.removeBillEntry(b.id, 'payments', paymentId, payStateOf(b));
}
// Dues: completed bills with money still owed, grouped by customer.
const custKey = b => b.customerId || (b.customerName ? 'n:' + b.customerName.trim().toLowerCase() : 'walkin');
const custKeyName = (key, b) => getCustomer(key)?.name || b?.customerName || 'Walk-in customers';
const unpaidBills = () => allBills().filter(b => b.status === 'COMPLETED' && !b.isSettled).sort(byTime('completedAt'));
function duesByCustomer() {
  const map = new Map();
  for (const b of unpaidBills().filter(x => Math.abs(x.balance) >= 0.005)) {
    const k = custKey(b);
    const g = map.get(k) || { key: k, name: custKeyName(k, b), bills: [], balance: 0 };
    g.bills.push(b);
    g.balance = round2(g.balance + b.balance);
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.balance - a.balance);
}
// Wire bundles: a customer takes a bundle, uses what they need and brings it
// back; they pay for the weight difference. BS = weighed with its box,
// Net = wire only. The box weight is deducted only when it doesn't come back.
const getBundle = id => S.bundles.find(b => b.id === id);
const openBundles = () => S.bundles.filter(b => b.status === 'OUT').sort(byTime('outAt'));
const kg = q => fmtQty(round3(q), 'KG');
const bundleGiven = bd => `Given ${kg(bd.outWeight)} kg ${bd.packing === 'BS' ? `BS (box ${kg(bd.boxWeight || 0)})` : 'Net'}`;
const PENDING = 'Awaiting return';
function bundleCalc(bd, retKg, withBox) {
  const box = bd.packing === 'BS' ? bd.boxWeight || 0 : 0;
  const back = retKg > 0 ? retKg : 0;
  const deductBox = box > 0 && !(back > 0 && withBox);
  const used = round3(bd.outWeight - back - (deductBox ? box : 0));
  const returned = !back ? 'Not returned'
    : bd.packing === 'BS' ? `Returned ${kg(back)} kg ${withBox ? 'with box' : 'without box'}` : `Returned ${kg(back)} kg`;
  // Shown on the bill line: what was given, what came back, what is billed.
  const note = [bundleGiven(bd), returned, `Net wire used ${kg(used)} kg`].join(' · ');
  return { box, back, deductBox, used, note };
}
const noteLines = note => String(note || '').split(' · ');
// The customer's open bill, or a new one for them.
function openBillFor(c) {
  let bill = activeBills().filter(b => b.customerChosen && custKey(b) === custKey(c)).pop();
  if (!bill) bill = createBill({ customerChosen: true, customerId: c.customerId || null, customerName: c.customerName || '', customerPhone: c.customerPhone || '', customerType: c.customerId ? 'REGULAR' : 'ONE_OFF' });
  return bill;
}
// A bundle given out sits on the bill as an "awaiting return" line; the
// return fills in that same line with the net wire used.
function giveBundle(d, bill) {
  const p = getProduct(d.productId);
  const at = now();
  const bd = {
    id: uid(), status: 'OUT', customerId: bill.customerId || null, customerName: bill.customerName || '', customerPhone: bill.customerPhone || '',
    productId: p.id, productName: p.name, rate: d.variant ? d.variant.price : p.price, variantId: d.variant?.id || null, variant: d.variant ? variantLabel(d.variant) : '', packing: d.packing, boxWeight: d.packing === 'BS' ? round3(num(d.box) || 0) : 0,
    outWeight: round3(num(d.out) || 0), note: (d.note || '').trim(), size: d.size || '', outAt: at, outBy: S.user.email, updatedAt: at, billId: bill.id, itemId: uid(),
  };
  S.bundles.push(bd);
  cloud.put('bundles', bd);
  putBillItem(bill, {
    id: bd.itemId, billId: bill.id, productId: p.id, productName: p.name, category: p.category, unit: 'KG', priceType: 'PER_KG',
    allowDecimal: true, quantity: 0, rate: bd.rate, amount: 0, isNegative: false, pending: true, bundleId: bd.id, size: bd.size, variant: bd.variant,
    note: `${bundleGiven(bd)} · ${PENDING}`, addedAt: at, addedBy: S.user.email,
  }, bill.status === 'DRAFT' ? { status: 'ACTIVE' } : {});
  rememberSize(p, bd.size);
  if (d.packing === 'BS' && d.saveBox && bd.boxWeight && p.boxWeight !== bd.boxWeight) {
    p.boxWeight = bd.boxWeight;
    cloud.update('products', p.id, { boxWeight: bd.boxWeight, updatedAt: at });
  }
  return bd;
}
// Bill cancelled: the wire is still with the customer, so the bundle stays
// out and will go on a new bill when it comes back.
function detachBundle(id) {
  const bd = getBundle(id);
  if (!bd) return;
  const reset = { status: 'OUT', billId: null, itemId: null, returnAt: null, returnNote: null, usedKg: null, amount: null, updatedAt: now() };
  Object.assign(bd, reset);
  cloud.update('bundles', id, reset);
}
const totalDue = () => round2(unpaidBills().reduce((s, b) => s + b.balance, 0));
function deleteBill(b) {
  S.bills = S.bills.filter(x => x.id !== b.id);
  cloud.remove('bills', b.id);
}

// Each phone numbers its own bills (R-1, R-2… / P-1, P-2…) so two phones
// working offline never hand out the same number.
function deviceCode() {
  let code = local.get('deviceCode');
  if (!code) {
    const first = ((S.user?.displayName || S.user?.email || 'A').match(/[a-z]/i)?.[0] || 'A').toUpperCase();
    code = first;
    for (let i = 0; S.counters[code] != null && i < 26; i++) code = String.fromCharCode(65 + ((first.charCodeAt(0) - 65 + i + 1) % 26));
    local.set('deviceCode', code);
  }
  return code;
}
// Bills created on this phone in the last few seconds. Sync updates can
// arrive before the new bill is in every query, so keep it visible meanwhile.
const justCreated = new Map();
function createBill(fields = {}) {
  const dev = deviceCode();
  const seen = allBills().filter(b => b.device === dev).map(b => b.billNo || 0);
  const no = Math.max(local.get('counter.' + dev, 0), S.counters[dev] || 0, ...seen) + 1;
  local.set('counter.' + dev, no);
  cloud.setMeta('counters', { [dev]: no });
  const b = {
    id: uid(), billNo: no, device: dev, status: 'DRAFT', customerChosen: false,
    customerId: null, customerName: '', customerPhone: '', customerType: null,
    items: [], subtotal: 0, total: 0, createdAt: now(), updatedAt: now(), completedAt: null,
    createdBy: S.user.email, ...fields,
  };
  if (fields.customerName != null || fields.customerId) b.customerChosen = true;
  S.bills.push(b);
  justCreated.set(b.id, { bill: b, at: Date.now() });
  cloud.put('bills', billToDoc(b));
  return b;
}
// Bills this phone opened with "Add to bill" and abandoned before choosing anyone.
// Abandoned empty drafts from this phone are removed after 10 minutes (never
// straight away, so a half-synced new bill can't be deleted by mistake).
function purgeEmptyDrafts() {
  const mine = b => b.device === local.get('deviceCode') && b.createdBy === S.user.email;
  const old = b => Date.now() - new Date(b.updatedAt || b.createdAt) > 10 * 60e3;
  for (const b of S.bills.filter(b => isEmptyDraft(b) && mine(b) && old(b) && !justCreated.has(b.id))) deleteBill(b);
}
function todayStats() {
  const t = now();
  const done = S.bills.filter(b => b.status === 'COMPLETED' && b.completedAt && sameDay(b.completedAt, t));
  return { count: done.length, total: round2(done.reduce((s, b) => s + b.total, 0)) };
}
function saveCustomer(f, existing = null) {
  const c = existing ? { ...existing } : { id: uid(), createdAt: now(), lastBilledAt: null };
  Object.assign(c, { name: f.name, phone: f.phone || '', address: f.address || '', notes: f.notes || '', type: f.type || 'REGULAR', updatedAt: now() });
  S.customers = S.customers.filter(x => x.id !== c.id).concat(c);
  cloud.put('customers', c);
  return c;
}
// sign 1 = sold (stock goes out, scrap comes in); -1 = undo that.
function stockMove(it, sign = 1) {
  const p = getProduct(it.productId);
  if (p && typeof p.stock === 'number' && p.unit === it.unit && it.quantity) {
    const delta = sign * (it.rate < 0 ? it.quantity : -it.quantity);
    p.stock = round3(p.stock + delta);
    cloud.addStock(p.id, delta, now());
  }
}
function adjustStock(bill) {
  bill.items.forEach(it => stockMove(it, 1));
}
const isOpenBill = b => b.status === 'ACTIVE' || b.status === 'DRAFT';
const billHref = b => (isOpenBill(b) ? `/bill/${b.id}` : `/receipt/${b.id}`);
// Completed bills where a wire bundle hasn't come back yet.
const awaitingBills = () => S.bills.filter(b => b.status === 'COMPLETED' && b.wireOut).sort(byTime('completedAt'));

// ---------------------------------------------------------------- live data
let unsubscribe = null;

function onData(name, rows, meta) {
  if (name === 'products') S.products = rows;
  else if (name === 'customers') S.customers = rows;
  else if (name === 'bills') {
    const prev = new Map(S.bills.map(b => [b.id, b]));
    S.bills = rows.map(billFromDoc).map(b => {
      const mine = prev.get(b.id);
      const recent = Date.now() - (localWrites.get(b.id) || 0) < 10e3;
      return recent && mine && (mine.updatedAt || '') > (b.updatedAt || '') ? mine : b;
    });
    for (const [id, { bill, at }] of justCreated) {
      if (S.bills.some(b => b.id === id) || Date.now() - at > 15e3) justCreated.delete(id);
      else S.bills.push(bill);
    }
    // Two phones recording payments at the same moment can leave the stored
    // "settled" flag out of date; whichever phone notices fixes it.
    if (!meta.fromCache && !meta.pending) {
      for (const b of S.bills) {
        if (b.status === 'COMPLETED' && !b.legacyPaid && b.settled !== b.isSettled) {
          cloud.update('bills', b.id, { paid: b.paid, balance: b.balance, settled: b.isSettled });
        }
      }
    }
  }
  else if (name === 'bundles') S.bundles = rows;
  else if (name === 'meta') {
    const { id, ...shop } = rows.find(r => r.id === 'shop') || {};
    S.shop = { ...DEFAULT_SHOP, ...shop };
    const { id: _, ...counters } = rows.find(r => r.id === 'counters') || {};
    if (S.shop.countersResetAt && S.shop.countersResetAt > (local.get('countersResetAt') || '')) {
      Object.keys(localStorage).filter(k => k.startsWith('aone.counter.')).forEach(k => localStorage.removeItem(k));
      local.set('countersResetAt', S.shop.countersResetAt);
    }
    S.counters = counters;
  }
  const first = !S.loaded[name];
  const firstFromServer = !meta.fromCache && !S.fromServer[name];
  S.loaded[name] = true;
  if (!meta.fromCache) S.fromServer[name] = true;
  S.pending[name] = meta.pending;
  updateSyncBadge();
  if (meta.dataChanged || first || firstFromServer) scheduleRender();
}

function syncState() {
  if (!navigator.onLine) return { cls: 'off', text: '📴 Offline — saved on phone, will sync' };
  if (Object.values(S.pending).some(Boolean)) return { cls: 'wait', text: '⏳ Syncing…' };
  return { cls: 'ok', text: '☁ Synced' };
}
function updateSyncBadge() {
  const s = syncState();
  document.querySelectorAll('.sync-badge').forEach(el => {
    el.className = 'sync-badge ' + s.cls;
    el.textContent = s.text;
  });
}
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);

// Changes from the other phone re-render the screen, but never while you are
// typing or have a popup open — that update waits until you finish.
let renderPending = false;
const uiBusy = () => !$('#sheet').hidden || !$('#modal').hidden || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
function scheduleRender() {
  if (uiBusy()) renderPending = true;
  else render(true);
}
function flushRender() {
  if (renderPending && !uiBusy()) {
    renderPending = false;
    render(true);
  }
}
document.addEventListener('focusout', () => setTimeout(flushRender, 60));

// ---------------------------------------------------------------- routing
let R = { a: '', b: '', c: '' };
let payAfterRender = null;
let noteTimer = null; // "Part paid": open the payment screen once the finished bill shows

function go(path, replace = false) {
  const h = '#' + path;
  if (location.hash === h) render();
  else if (replace) {
    nav.replacing = true;
    location.replace(h);
  } else location.hash = h;
}
// In-app history, so Back returns to the screen you came from (same tab,
// filter and scroll position) instead of a fixed parent screen.
const nav = { stack: [location.hash || '#/'], replacing: false };
const scrollMem = {};
let restoreY = null;
function onHashChange(e) {
  scrollMem[new URL(e.oldURL).hash || '#/'] = window.scrollY;
  const h = location.hash || '#/';
  if (nav.replacing) nav.stack[nav.stack.length - 1] = h;
  else if (nav.stack.length > 1 && nav.stack.at(-2) === h) {
    nav.stack.pop();
    restoreY = scrollMem[h] ?? 0;
  } else nav.stack.push(h);
  nav.replacing = false;
  render();
}
function goBack(fallback) {
  if (nav.stack.length > 1) history.back();
  else go(fallback, true);
}

function render(keepScroll = false) {
  const y = window.scrollY;
  renderPending = false;
  closeSheet(true);
  const [a = '', b = '', c = ''] = location.hash.replace(/^#\/?/, '').split('/');
  R = { a, b, c };
  const html = S.user === undefined ? '<div class="boot">Loading…</div>'
    : !S.user ? viewLogin()
    : S.denied ? viewDenied()
    : route(a, b, c);
  if (html == null) return; // redirected
  app.innerHTML = html;
  window.scrollTo(0, keepScroll ? y : restoreY ?? 0);
  restoreY = null;
  updateSyncBadge();
  if (a === 'settings') fillStorageInfo();
  if (a === 'bundle') b === 'new' ? updateBundleNew() : updateBundleReturn();
  if (a === 'calc') updateCalcPage();
  if (payAfterRender && a === 'done' && b === payAfterRender) {
    payAfterRender = null;
    A.payBill({ dataset: { id: b } });
  }
  const chip = $('.pchip.on');
  if (chip) chip.parentElement.scrollLeft = chip.offsetLeft - 60;
}

function route(a, b, c) {
  switch (a) {
    case '': return viewHome();
    case 'bills': return viewActiveBills();
    case 'bill': {
      const bill = getBill(b);
      if (!bill || bill.status === 'COMPLETED' || bill.status === 'CANCELLED') {
        if (!bill && !S.loaded.bills) return '<div class="boot">Loading…</div>';
        return go('/', true);
      }
      if (c === 'customer') return viewCustomerPick(bill);
      if (!bill.customerChosen) return go(`/bill/${b}/customer`, true);
      if (c === 'add') return viewAddItem(bill);
      return viewBill(bill);
    }
    case 'done':
    case 'receipt': {
      const bill = getBill(b);
      if (!bill && !S.loaded.bills) return '<div class="boot">Loading…</div>';
      return bill ? viewReceipt(bill, a === 'done' ? '/' : '/history') : go('/history', true);
    }
    case 'history': return viewHistory();
    case 'reports': return b === 'product' ? viewProductReport(decodeURIComponent(c)) : viewReports();
    case 'dues': return viewDues();
    case 'statement': return viewStatement(decodeURIComponent(b));
    case 'settle': return viewSettlement(decodeURIComponent(b));
    case 'bundles': return viewBundles();
    case 'bundle': return b === 'new' ? viewBundleNew() : viewBundleReturn(b, c);
    case 'customers': return viewCustomers();
    case 'customer': return viewCustomerForm(b);
    case 'products': return viewProducts();
    case 'product': return viewProductForm(b);
    case 'settings': return viewSettings();
    case 'calc': return viewCalc();
    default: return go('/', true);
  }
}

// ---------------------------------------------------------------- shared bits
// smart = Back goes to the previous screen; billing screens keep a fixed parent.
function topbar(title, back, right = '', smart = true) {
  const btn = back == null ? '' : smart ? `<button type="button" class="tb-back" data-act="back" data-fb="${back}" aria-label="Back">‹</button>`
    : `<a class="tb-back" href="#${back}" aria-label="Back">‹</a>`;
  return `<header class="topbar">${btn}<h1>${title}</h1>${right}</header>`;
}
const micBtn = target => `<button type="button" class="mic" data-act="mic" data-target="${target}" aria-label="Speak name">🎤</button>`;

function billCard(b) {
  return `<button class="bill-card" data-act="openBill" data-id="${b.id}">
    <span class="dot ${b.items.length ? 'on' : ''}"></span>
    <span class="bc-name"><b>${esc(billName(b))}</b><small>${b.status === 'COMPLETED' && b.wireOut ? `⏳ wire out · ${billLabel(b)}${b.balance >= 0.005 ? ` · due ${money(b.balance)}` : ''}` : `${plural(b.items.length, 'item')} · ${billLabel(b)} · ${fmtTime(b.createdAt)}`}</small></span>
    <span class="bc-total ${b.total < 0 ? 'neg-text' : ''}">${money(b.total)}</span>
  </button>`;
}

// Screen language for this phone. Bills, receipts and shared text stay in English.
const langSwitch = () => {
  const l = local.get('lang', 'en');
  return `<section class="card" data-raw><h2>भाषा / Language</h2>
    <div class="seg sign"><button type="button" class="${l === 'en' ? 'on' : ''}" data-act="setLang" data-l="en">English</button>
      <button type="button" class="${l === 'hi' ? 'on' : ''}" data-act="setLang" data-l="hi">हिंदी</button></div></section>`;
};

// ---------------------------------------------------------------- views: sign-in
function viewLogin() {
  return `<header class="home-head"><div class="brand">A ONE ENTERPRISE</div><div class="today"><span>BILLING</span></div></header>
  <main class="page">
    <div class="card">
      <h2>Sign in to start</h2>
      <p>Products, customers and bills are shared live between the shop's phones. Sign in once with your Google account.</p>
      <button class="btn-big go" data-act="signIn">Sign in with Google</button>
      <p class="hint">${navigator.onLine ? 'After signing in once, the app also works without internet.' : '📴 You are offline. Connect to the internet once to sign in.'}</p>
    </div>
    ${langSwitch()}
    ${cloud.emulator ? `<div class="card"><h2>Test sign-in (emulator)</h2>
      <input id="emuEmail" class="input big" placeholder="test@example.com" autocomplete="off">
      <button class="btn-mid" data-act="emuSignIn">Test sign-in</button></div>` : ''}
  </main>`;
}
function viewDenied() {
  return `${topbar('Not allowed', null)}
  <main class="page">
    <div class="card">
      <h2>This account can't open the shop's data</h2>
      <p>Signed in as <b>${esc(S.user.email)}</b>.</p>
      <p class="hint">Only the Google accounts listed in the Firebase security rules can use this app. Sign out and use the right account, or ask the owner to add this one.</p>
      <button class="btn-big" data-act="signOut">Sign out</button>
    </div>
  </main>`;
}

// ---------------------------------------------------------------- views: home & bills
function viewHome() {
  purgeEmptyDrafts();
  const act = activeBills();
  const t = todayStats();
  const due = totalDue();
  const incomplete = S.products.filter(isIncomplete).length;
  return `
  <header class="home-head">
    <div class="brand">${esc(S.shop.shopName)}</div>
    ${S.shop.showTodaySales ? `<div class="today"><span>₹ TODAY'S SALES</span><b>${money(t.total)}</b><small>${plural(t.count, 'bill')} completed</small></div>` : ''}
    <a class="sync-badge" href="#/settings"></a>
  </header>
  <main class="page">
    ${setupCard()}
    <button class="btn-hero" data-act="newBill"><span>＋</span>ADD TO BILL</button>
    <a class="btn-big calc-hero" href="#/calc">🧮 QUICK CALCULATOR</a>
    <a class="sec-head" href="#/bills"><span>ACTIVE BILLS${act.length ? `<i class="count">${act.length}</i>` : ''}</span><span class="more">All ›</span></a>
    ${act.length ? `<div class="list">${act.slice(0, 6).map(billCard).join('')}</div>` : '<p class="empty">No open bills right now</p>'}
    ${act.length > 6 ? `<a class="btn-text" href="#/bills">+${act.length - 6} more bills</a>` : ''}
    ${awaitingBills().length ? `<div class="sec-label">⏳ WAITING FOR WIRE RETURN</div><div class="list">${awaitingBills().map(billCard).join('')}</div>` : ''}
    <a class="row bundle-row" href="#/bundles"><span class="ti">🧵</span><span class="row-main"><b>WIRE BUNDLES</b><small>${openBundles().length ? `${plural(openBundles().length, 'bundle')} out with customers` : 'Give a bundle · bill on return'}</small></span><span class="chev">›</span></a>
    <nav class="grid2">
      <a class="tile" href="#/reports"><span class="ti">📊</span>REPORTS</a>
      <a class="tile ${due ? 'has-due' : ''}" href="#/dues"><span class="ti">💰</span>DUES<small>${due ? money(due) : 'None'}</small></a>
      <a class="tile" href="#/customers"><span class="ti">👤</span>CUSTOMERS</a>
      <a class="tile ${incomplete ? 'has-inc' : ''}" href="#/products"><span class="ti">📦</span>PRODUCTS${incomplete ? `<small>⚠ ${incomplete} to check</small>` : ''}</a>
      <a class="tile" href="#/history"><span class="ti">🧾</span>HISTORY</a>
      <a class="tile" href="#/settings"><span class="ti">⚙️</span>SETTINGS</a>
    </nav>
  </main>`;
}
// First-run help: move this phone's pre-sync data up, or start a catalogue.
function setupCard() {
  const L = S.legacy;
  if (L && !local.get('migrated')) {
    return `<div class="card note">
      <h2>Move this phone's data to the cloud</h2>
      <p>Saved on this phone before sync: ${plural(L.products.length, 'product')}, ${plural(L.customers.length, 'customer')}, ${plural(L.bills.length, 'bill')}.</p>
      <p class="hint">Products and customers already in the cloud (same name) are skipped.</p>
      <div class="btn-row"><button class="btn-mid" data-act="dismissMigrate">Not now</button><button class="btn-mid go" data-act="migrate">UPLOAD</button></div>
    </div>`;
  }
  if (S.fromServer.products && !S.products.length) {
    return `<div class="card note"><h2>No products yet</h2>
      <p>Start with the sample list (copper, bearings, scrap…) and edit prices, or add your own under Products.</p>
      <button class="btn-mid go" data-act="loadSamples">ADD SAMPLE PRODUCTS</button></div>`;
  }
  return '';
}

function viewActiveBills() {
  purgeEmptyDrafts();
  const act = activeBills();
  return `${topbar('Active bills', '/')}
  <main class="page">
    <button class="btn-big go" data-act="newBill">＋ NEW BILL</button>
    ${act.length ? `<div class="list">${act.map(billCard).join('')}</div>` : '<p class="empty">No open bills</p>'}
  </main>`;
}

// --- customer selection for a bill
function viewCustomerPick(bill) {
  const back = bill.customerChosen || bill.items.length ? `/bill/${bill.id}` : '/';
  return `${topbar(`Bill ${billLabel(bill)} · Customer`, back, '', false)}
  <main class="page">
    <div class="search-row">
      <input id="custSearch" class="input big" type="search" placeholder="Type or 🎤 speak name" autocomplete="off" enterkeyhint="search">
      ${micBtn('custSearch')}
    </div>
    <button class="btn-big alt" data-act="oneOff">ONE-OFF CUSTOMER</button>
    <div id="custResults" class="list">${customerPickResults('')}</div>
  </main>`;
}
function customerPickResults(q) {
  const list = searchCustomers(q).slice(0, 60);
  const typed = q.trim();
  let html = (list.length ? '<div class="sec-label">REGULAR CUSTOMERS</div>' : '') + list.map(c => `<button class="row" data-act="pickCustomer" data-id="${c.id}">
      <span class="row-main"><b>${esc(c.name)}</b>${c.phone ? `<small>${esc(c.phone)}</small>` : ''}</span><span class="chev">›</span></button>`).join('');
  if (typed) {
    const exact = list.some(c => c.name.toLowerCase() === typed.toLowerCase());
    html += `<button class="row accent" data-act="useTypedName"><span class="row-main"><b>Use “${esc(typed)}”</b><small>One-off — not saved to customers</small></span><span class="chev">›</span></button>`;
    if (!exact) html += `<button class="row" data-act="saveTypedName"><span class="row-main"><b>＋ Save “${esc(typed)}”</b><small>Add as regular customer</small></span><span class="chev">›</span></button>`;
  }
  return html || '<p class="empty">No saved customers yet.<br>Type or speak a name above.</p>';
}

// --- product picker
function viewAddItem(bill) {
  return `${topbar(`Add item · ${esc(billName(bill))}`, `/bill/${bill.id}`, '', false)}
  <main class="page has-footer">
    <input id="prodSearch" class="input big" type="search" placeholder="🔍 Search product…" autocomplete="off" enterkeyhint="go">
    <div class="btn-row"><button class="btn-mid newp" data-act="quickAdd">＋ NEW PRODUCT</button><button class="btn-mid newp" data-act="quickAddVoice">🎤 SPEAK NEW</button></div>
    <button class="btn-mid bundle-btn" data-act="bundleInBill">🧵 GIVE WIRE BUNDLE (BS / Net)</button>
    <div id="prodResults">${productPickResults('')}</div>
  </main>
  <footer class="footbar">
    <a class="sumbar" href="#/bill/${bill.id}">
      <span>${plural(bill.items.length, 'item')}</span>
      <b class="${bill.total < 0 ? 'neg-text' : ''}">${money(bill.total)}</b>
      <span class="go">VIEW BILL ›</span>
    </a>
  </footer>`;
}
function ptile(p) {
  return `<button class="ptile ${p.price < 0 || p.category === 'SCRAP' ? 'neg' : ''}" data-act="pickProduct" data-id="${p.id}">
    <span class="pt-name">${esc(p.name)}${isIncomplete(p) ? ' <i class="inc-dot" title="Details missing">!</i>' : ''}</span>
    <span class="pt-rate">${hasVariants(p) ? `${plural(p.variants.length, 'option')} · ${variantPrices(p)}` : p.price ? rateText(p.price, p.priceType) : 'Enter rate'}</span></button>`;
}
function productPickResults(q) {
  const act = S.products.filter(p => p.active);
  if (q.trim()) {
    const m = searchProducts(act, q);
    const addNew = `<button class="btn-big alt" data-act="quickAdd" data-name="${esc(q.trim())}">＋ Add “${esc(q.trim())}” as new product</button>`;
    return m.length ? `<div class="ptiles">${m.map(ptile).join('')}</div>${addNew}` : `<p class="empty">No product matches “${esc(q)}”</p>${addNew}`;
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  const favs = act.filter(p => p.favourite).sort(byName);
  let html = favs.length ? `<div class="sec-label">⭐ QUICK ITEMS</div><div class="ptiles">${favs.map(ptile).join('')}</div>` : '';
  for (const [cat, label] of Object.entries(CATEGORIES)) {
    const list = act.filter(p => p.category === cat).sort(byName);
    if (list.length) html += `<div class="sec-label">${label.toUpperCase()}</div><div class="ptiles">${list.map(ptile).join('')}</div>`;
  }
  return html || '<p class="empty">No products yet. Add them under Products.</p>';
}

// --- the bill
function viewBill(bill) {
  const act = activeBills();
  const sec = billSections(bill);
  const c = bill.customerId ? getCustomer(bill.customerId) : null;
  const sub = [bill.customerPhone, bill.customerType === 'REGULAR' ? 'Regular' : 'One-off'].filter(Boolean).join(' · ');
  return `${topbar(`Bill ${billLabel(bill)}`, '/', `<span class="status">${bill.status}</span>`, false)}
  <nav class="switcher">
    ${act.map(b => `<button class="chip ${b.id === bill.id ? 'on' : ''}" data-act="openBill" data-id="${b.id}"><b>${esc(billName(b))}</b><small>${money(b.total)}</small></button>`).join('')}
    <button class="chip add" data-act="newBill">＋ New</button>
  </nav>
  <main class="page has-footer-lg">
    ${bill.customerChosen ? openBundles().filter(bd => custKey(bd) === custKey(bill) && bd.billId !== bill.id).map(bd => `<a class="bundle-note" href="#/bundle/${bd.id}/${bill.id}">🧵 <span><b>${esc(bundleTitle(bd))} bundle out</b><small>${kg(bd.outWeight)} kg ${bd.packing === 'BS' ? 'BS' : 'Net'} · given ${fmtDate(bd.outAt)}</small></span><span class="link">Return &amp; bill</span></a>`).join('') : ''}
    <button class="cust-card" data-act="changeCustomer">
      <span class="cc-ico">👤</span>
      <span class="cc-main"><small>CUSTOMER</small><b>${esc(billName(bill))}</b>${sub ? `<small>${esc(sub)}${c && c.notes ? ' · ' + esc(c.notes) : ''}</small>` : ''}</span>
      <span class="link">Change</span>
    </button>
    <div class="note-box"><label class="lbl" for="billNote">📝 NOTE ON BILL (optional)</label>
      <div class="search-row"><textarea id="billNote" class="input" rows="2" placeholder="e.g. 5 HP motor, deliver tomorrow">${esc(bill.remark || '')}</textarea>${micBtn('billNote')}</div></div>
    ${!bill.items.length ? '<div class="empty big">No items yet.<br>Tap <b>＋ ADD ITEM</b> below.</div>'
      : !sec.scrap.length ? `<div class="items">${sec.sales.map(itemRow).join('')}</div>`
      : `${sec.sales.length ? `<div class="sec-label">ITEMS</div><div class="items">${sec.sales.map(itemRow).join('')}
          <div class="subtotal"><span>ITEMS TOTAL</span><b>${money(sec.salesTotal)}</b></div></div>` : ''}
        <div class="sec-label neg-text">SCRAP TAKEN (MINUS)</div><div class="items scrap-box">${sec.scrap.map(itemRow).join('')}
          <div class="subtotal neg"><span>SCRAP TOTAL</span><b>${money(sec.scrapTotal)}</b></div></div>`}
  </main>
  <footer class="footbar bill-foot">
    <div class="total-row"><span>${finalLabel(bill)}</span><b class="${bill.total < 0 ? 'neg-text' : ''}">${money(Math.abs(bill.total))}</b></div>
    ${bill.payments?.length ? `<div class="paid-row">Paid earlier ${money(bill.paid)} · Balance ${money(bill.balance)}</div>` : ''}
    <a class="btn-mid add" href="#/bill/${bill.id}/add">＋ ADD ITEM</a>
    <div class="foot-btns">
      <button class="btn-mid danger" data-act="cancelBill">CANCEL</button>
      <button class="btn-mid" data-act="saveBill">SAVE</button>
      <button class="btn-mid go" data-act="completeBill">✓ COMPLETE</button>
    </div>
  </footer>`;
}
function itemRow(it) {
  const neg = it.amount < 0;
  return `<button class="item ${neg ? 'neg' : ''} ${it.pending ? 'pending' : ''}" data-act="editItem" data-id="${it.id}">
    <span class="it-main"><span class="it-name">${esc(itemTitle(it))}</span>
    <span class="it-calc">${it.bundleId ? '<span class="tag bundle">BUNDLE</span> ' : ''}${it.pending ? '<span>Tap when wire comes back</span>' : calcOrPending(it, neg)}</span>
    ${it.note ? `<span class="it-note">${noteLines(it.note).map(l => `<span>${esc(l)}</span>`).join('')}</span>` : ''}</span>
    <span class="it-amt">${it.pending ? '⏳' : amountOrPending(it)}</span></button>`;
}
const bundleNoCharge = it => it.pending || (it.bundleId && !it.quantity && !it.amount);
const calcOrPending = (it, plain) => (bundleNoCharge(it) ? 'Wire bundle given' : lineCalcText(it, plain));
const amountOrPending = it => (bundleNoCharge(it) ? '—' : money(it.amount));

// --- receipt
function receiptHtml(b) {
  const s = S.shop;
  const when = b.completedAt || b.updatedAt;
  return `<article class="receipt" id="receipt">
    <div class="r-shop">${esc(s.shopName)}</div>
    ${s.shopAddress ? `<div class="r-sub">${esc(s.shopAddress)}</div>` : ''}
    ${s.shopPhone ? `<div class="r-sub">📞 ${esc(s.shopPhone)}</div>` : ''}
    <div class="r-meta"><span>Bill ${billLabel(b)}</span><span>${fmtDate(when)}, ${fmtTime(when)}</span></div>
    <div class="r-cust">Customer: <b>${esc(billName(b))}</b>${b.customerPhone ? ` · ${esc(b.customerPhone)}` : ''}</div>
    ${b.remark ? `<div class="r-remark">Note: ${esc(b.remark)}</div>` : ''}
    ${(() => {
      const sec = billSections(b);
      const line = it => `<div class="r-item ${it.amount < 0 ? 'neg' : ''}"><div class="r-name">${esc(itemTitle(it))}${itemPayTag(b, it) ? ` <span class="tag ${itemPayTag(b, it) === 'PAID' ? 'paid' : 'due'}">${itemPayTag(b, it)}</span>` : ''}</div>
        <div class="r-line"><span>${calcOrPending(it, it.amount < 0)}</span><b>${amountOrPending(it)}</b></div>${noteLines(it.note).filter(Boolean).map(l => `<div class="r-note">${esc(l)}</div>`).join('')}</div>`;
      if (!sec.scrap.length) return `<div class="r-items">${sec.sales.map(line).join('')}</div>`;
      return `${sec.sales.length ? `<div class="r-items">${sec.sales.map(line).join('')}</div>
        <div class="r-subtotal"><span>Items total</span><b>${money(sec.salesTotal)}</b></div>` : ''}
        <div class="r-section neg-text">SCRAP TAKEN (MINUS)</div>
        <div class="r-items">${sec.scrap.map(line).join('')}</div>
        <div class="r-subtotal neg-text"><span>Scrap total</span><b>${money(sec.scrapTotal)}</b></div>`;
    })()}
    <div class="r-total"><span>${finalLabel(b)}</span>${b.status === 'CANCELLED' ? '<i class="stamp">CANCELLED</i>' : b.status !== 'COMPLETED' ? '' : b.wireOut ? '<i class="stamp due">WIRE OUT</i>' : b.isSettled ? '<i class="stamp ok">PAID</i>' : '<i class="stamp due">DUE</i>'}<b>${money(Math.abs(b.total))}</b></div>
    ${b.status === 'COMPLETED' && (b.payments.length > 1 || !b.isSettled) ? `<div class="r-pay">
      ${b.payments.map(p => `<div><span>${p.amount < 0 ? 'Paid out' : 'Received'} · ${fmtDate(p.at)}${p.method ? ' · ' + esc(p.method) : ''}${p.itemIds ? ` · for ${esc(itemNames(b, p.itemIds))}` : ''}</span><b>${money(Math.abs(p.amount))}</b></div>`).join('')}
      ${b.isSettled ? '' : `<div class="r-bal"><span>BALANCE ${b.balance < 0 ? 'TO PAY CUSTOMER' : 'DUE'}</span><b>${money(Math.abs(b.balance))}</b></div>`}
    </div>` : ''}
    <div class="r-foot">${plural(b.items.length, 'item')} · Thank you!</div>
  </article>`;
}
const noteBoxHtml = bill => `<div class="note-box"><label class="lbl" for="billNote">📝 NOTE ON BILL (optional)</label>
      <div class="search-row"><textarea id="billNote" class="input" rows="2" placeholder="e.g. 5 HP motor, deliver tomorrow">${esc(bill.remark || '')}</textarea>${micBtn('billNote')}</div></div>`;
function paymentsPanel(b) {
  if (b.status !== 'COMPLETED' || b.legacyPaid) return '';
  return `<section class="card"><h2>Payments</h2>
    ${b.payments.length ? b.payments.map(p => `<div class="pay-row"><span><b>${money(Math.abs(p.amount))}</b> ${p.amount < 0 ? 'paid out' : 'received'}<small>${fmtDate(p.at)}, ${fmtTime(p.at)}${p.method ? ' · ' + esc(p.method) : ''}</small>${p.itemIds ? `<small class="pay-for">for: ${esc(itemNames(b, p.itemIds))}</small>` : ''}</span>
      <button class="x" data-act="deletePayment" data-bill="${b.id}" data-id="${p.id}" aria-label="Delete payment">✕</button></div>`).join('') : '<p class="hint">No payment yet.</p>'}
    ${b.wireOut && Math.abs(b.balance) < 0.005 ? '<p class="due-note">⏳ Paid so far — wire used will be added to this bill when the bundle comes back.</p>'
      : b.isSettled ? '<p class="settled-note">✓ Fully settled</p>' : `<p class="due-note">Balance ${b.balance < 0 ? 'to pay customer' : 'due'}: <b>${money(Math.abs(b.balance))}</b></p>
      <button class="btn-big go" data-act="payBill" data-id="${b.id}">${b.balance < 0 ? 'RECORD PAYOUT' : '₹ RECEIVE PAYMENT'}</button>`}
  </section>`;
}
function receiptText(b) {
  const when = b.completedAt || b.updatedAt;
  const lines = [
    S.shop.shopName, S.shop.shopAddress, S.shop.shopPhone && `Ph: ${S.shop.shopPhone}`,
    `Bill ${billLabel(b)} · ${fmtDate(when)} ${fmtTime(when)}`,
    `Customer: ${billName(b)}${b.customerPhone ? ' (' + b.customerPhone + ')' : ''}`,
    b.remark && `Note: ${b.remark}`,
    '------------------------------',
    ...(() => {
      const sec = billSections(b);
      const line = it => `${itemTitle(it)}${itemPayTag(b, it) ? ` [${itemPayTag(b, it)}]` : ''}\n  ${calcOrPending(it, it.amount < 0)} = ${amountOrPending(it)}${it.note ? noteLines(it.note).map(l => `\n    ${l}`).join('') : ''}`;
      if (!sec.scrap.length) return sec.sales.map(line);
      return [
        ...sec.sales.map(line), sec.sales.length && `Items total: ${money(sec.salesTotal)}`,
        '', 'SCRAP TAKEN (MINUS)', ...sec.scrap.map(line), `Scrap total: ${money(sec.scrapTotal)}`,
      ];
    })(),
    '------------------------------',
    `${finalLabel(b)}: ${money(Math.abs(b.total))}`,
    b.status === 'COMPLETED' && !b.isSettled && [...b.payments.map(p => payLine(b, p)), `BALANCE DUE: ${money(Math.abs(b.balance))}`].join('\n'),
    b.status === 'CANCELLED' ? '*** CANCELLED ***' : 'Thank you!',
  ];
  return lines.filter(Boolean).join('\n');
}
function viewReceipt(bill, back) {
  return `${topbar(`Bill ${billLabel(bill)}`, back, `<span class="status">${bill.status}</span>`, back !== '/')}
  <main class="page">
    ${bill.status === 'COMPLETED' ? bill.items.filter(i => i.pending && getBundle(i.bundleId)).map(i => `<a class="bundle-note" href="#/bundle/${i.bundleId}/${bill.id}">⏳ <span><b>Waiting for wire return</b><small>${esc(itemTitle(i))} · ${esc(bundleGiven(getBundle(i.bundleId)))}</small></span><span class="link">Enter return</span></a>`).join('') : ''}
    ${receiptHtml(bill)}
    ${paymentsPanel(bill)}
    ${bill.status !== 'CANCELLED' ? `<section class="card">${noteBoxHtml(bill)}</section>` : ''}
    <div class="btn-row">
      <button class="btn-mid" data-act="shareBill" data-id="${bill.id}">📤 SHARE</button>
      <button class="btn-mid" data-act="printBill" data-id="${bill.id}">🖨 PRINT</button>
    </div>
    ${bill.status === 'COMPLETED' ? `<button class="btn-mid edit-btn" data-act="editBill" data-id="${bill.id}">✎ EDIT BILL — add items, change customer, qty or rate</button>` : ''}
    <button class="btn-big go" data-act="newBill">＋ NEW BILL</button>
    <a class="btn-mid" href="#/">HOME</a>
    <button class="btn-text danger" data-act="deleteBillDoc" data-id="${bill.id}">🗑 Delete this bill</button>
  </main>`;
}

// --- history
function viewHistory() {
  return `${topbar('History', '/')}
  <main class="page">
    <input id="histSearch" class="input big" type="search" placeholder="🔍 Customer name or bill #" autocomplete="off">
    <div id="histResults">${historyResults('')}</div>
    <button class="btn-mid" data-act="loadOlder">Load older bills</button>
  </main>`;
}
function historyResults(q) {
  const s = q.trim().toLowerCase().replace(/^#/, '');
  const when = b => b.completedAt || b.updatedAt;
  const list = allBills()
    .filter(b => b.status === 'COMPLETED' || b.status === 'CANCELLED')
    .filter(b => !s || billName(b).toLowerCase().includes(s) || billLabel(b).slice(1).toLowerCase() === s || String(b.billNo) === s || (b.customerPhone || '').includes(s))
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, 500);
  if (!list.length) return `<p class="empty">${s ? 'No matching bills' : 'No completed bills yet'}</p>`;
  const groups = [];
  for (const b of list) {
    const d = fmtDate(when(b));
    if (!groups.length || groups.at(-1).d !== d) groups.push({ d, bills: [] });
    groups.at(-1).bills.push(b);
  }
  return groups.map(g => {
    const done = g.bills.filter(b => b.status === 'COMPLETED');
    const total = round2(done.reduce((s, b) => s + b.total, 0));
    return `<div class="day-head"><span>${g.d}</span><span>${plural(done.length, 'bill')} · ${money(total)}</span></div>
    <div class="list">${g.bills.map(b => `<button class="hrow ${b.status === 'CANCELLED' ? 'cancelled' : ''}" data-act="openReceipt" data-id="${b.id}">
      <span class="h-time">${fmtTime(when(b))}</span>
      <span class="h-main"><b>${esc(billName(b))}</b><small>${plural(b.items.length, 'item')} · ${billLabel(b)}${b.status === 'CANCELLED' ? ' · <span class="tag cancel">CANCELLED</span>' : `${b.wireOut ? ' · <span class="tag bundle">WIRE OUT</span>' : ''}${Math.abs(b.balance) >= 0.005 ? ` · <span class="tag due">DUE ${money(Math.abs(b.balance))}</span>` : ''}`}</small></span>
      <span class="h-amt ${b.total < 0 ? 'neg-text' : ''}">${money(b.total)}</span></button>`).join('')}</div>`;
  }).join('');
}

// --- customers
function viewCustomers() {
  return `${topbar('Customers', '/', '<a class="tb-act" href="#/customer/new">＋ Add</a>')}
  <main class="page">
    <div class="search-row">
      <input id="custAdminSearch" class="input big" type="search" placeholder="🔍 Name or phone" autocomplete="off">
      ${micBtn('custAdminSearch')}
    </div>
    <a class="btn-big alt" href="#/customer/new">＋ ADD CUSTOMER</a>
    <div id="custAdminResults" class="list">${customerAdminResults('')}</div>
  </main>`;
}
function customerAdminResults(q) {
  const list = searchCustomers(q);
  if (!list.length) return `<p class="empty">${q ? 'No match' : 'No customers yet'}</p>`;
  const dues = new Map(duesByCustomer().map(g => [g.key, g.balance]));
  return `<div class="sec-label">${plural(list.length, 'customer')}</div>` + list.map(c => `<a class="row" href="#/statement/${c.id}">
    <span class="row-main"><b>${esc(c.name)}</b><small>${esc([c.phone, c.type === 'ONE_OFF' ? 'One-off' : '', c.address].filter(Boolean).join(' · ')) || '&nbsp;'}</small></span>
    ${dues.get(c.id) ? `<span class="due-amt">DUE<b>${money(dues.get(c.id))}</b></span>` : ''}<span class="chev">›</span></a>`).join('');
}
function viewCustomerForm(id) {
  const isNew = id === 'new';
  const c = isNew ? { name: '', phone: '', address: '', notes: '', type: 'REGULAR' } : getCustomer(id);
  if (!c) return S.loaded.customers ? go('/customers', true) : '<div class="boot">Loading…</div>';
  return `${topbar(isNew ? 'New customer' : 'Edit customer', '/customers')}
  <main class="page">
    <form id="custForm" class="form" data-id="${isNew ? '' : c.id}" autocomplete="off">
      <label class="lbl" for="cfName">NAME *</label>
      <div class="search-row"><input id="cfName" name="name" class="input big" value="${esc(c.name)}" placeholder="Customer name">${micBtn('cfName')}</div>
      <label class="lbl" for="cfPhone">PHONE</label>
      <input id="cfPhone" name="phone" class="input big" type="tel" inputmode="tel" value="${esc(c.phone)}">
      <label class="lbl" for="cfAddr">ADDRESS</label>
      <textarea id="cfAddr" name="address" class="input" rows="2">${esc(c.address)}</textarea>
      <label class="lbl" for="cfNotes">NOTES</label>
      <textarea id="cfNotes" name="notes" class="input" rows="2">${esc(c.notes)}</textarea>
      <label class="lbl">CUSTOMER TYPE</label>
      <div class="seg">
        <label><input type="radio" name="type" value="REGULAR" ${c.type !== 'ONE_OFF' ? 'checked' : ''}><span>Regular</span></label>
        <label><input type="radio" name="type" value="ONE_OFF" ${c.type === 'ONE_OFF' ? 'checked' : ''}><span>One-off</span></label>
      </div>
      <button class="btn-big go" type="submit">SAVE CUSTOMER</button>
      ${isNew ? '' : `<button type="button" class="btn-mid" data-act="billForCustomer" data-id="${c.id}">＋ Start a bill for ${esc(c.name)}</button>
      <button type="button" class="btn-text danger" data-act="deleteCustomer" data-id="${c.id}">Delete customer</button>`}
    </form>
  </main>`;
}

// --- products
let reviewOnly = false;
function viewProducts() {
  const n = S.products.filter(isIncomplete).length;
  if (!n) reviewOnly = false;
  return `${topbar('Products', '/', '<a class="tb-act" href="#/product/new">＋ Add</a>')}
  <main class="page">
    ${n ? `<button class="review-banner ${reviewOnly ? 'on' : ''}" data-act="toggleReview">⚠ ${plural(n, 'product')} ${n === 1 ? 'needs' : 'need'} details<small>${reviewOnly ? 'Showing only these · tap to show all' : 'Added while billing · tap to see them'}</small></button>` : ''}
    <input id="prodAdminSearch" class="input big" type="search" placeholder="🔍 Product or SKU" autocomplete="off">
    <p class="hint">Tap ★ for quick items. Tap the price to change it.</p>
    <div id="prodAdminResults" class="list">${productAdminResults('')}</div>
    <a class="btn-big alt" href="#/product/new">＋ ADD PRODUCT</a>
  </main>`;
}
function prow(p) {
  const neg = p.price < 0;
  const low = typeof p.stock === 'number' && typeof p.minStock === 'number' && p.stock <= p.minStock;
  const missing = missingInfo(p);
  const info = [CATEGORIES[p.category], hasVariants(p) ? plural(p.variants.length, 'variant') : '', p.sku,
    typeof p.stock === 'number' ? `Stock: ${fmtQty(p.stock, p.unit)} ${unitLabel(p.unit, p.stock)}` : '',
    p.active ? '' : 'INACTIVE'].filter(Boolean).map(esc).join(' · ');
  return `<div class="prow ${p.active ? '' : 'inactive'} ${neg ? 'negp' : ''} ${missing.length ? 'incomplete' : ''}">
    <button class="star ${p.favourite ? 'on' : ''}" data-act="toggleFav" data-id="${p.id}" aria-label="Favourite">★</button>
    <a class="pr-main" href="#/product/${p.id}"><b>${esc(p.name)}</b>${missing.length ? `<small class="inc-text">⚠ Missing: ${missing.join(', ')}</small>` : ''}<small>${info}${low ? ' <span class="low">⚠ LOW</span>' : ''}</small></a>
    <button class="pr-price" data-act="editPrice" data-id="${p.id}">${hasVariants(p) ? variantPrices(p) : p.price ? rateText(p.price, p.priceType) : p.needsReview ? 'Not set' : 'At billing'}<small>${hasVariants(p) ? 'EDIT PRICES' : 'EDIT PRICE'}</small></button>
  </div>`;
}
function productAdminResults(q) {
  if (reviewOnly) {
    const list = S.products.filter(isIncomplete).sort(byTime('createdAt')).reverse();
    return list.length ? list.map(prow).join('') : '<p class="empty">All products are complete 🎉</p>';
  }
  if (q.trim()) {
    const m = searchProducts(S.products, q);
    return m.length ? m.map(prow).join('') : '<p class="empty">No match</p>';
  }
  let html = '';
  for (const [cat, label] of Object.entries(CATEGORIES)) {
    const list = S.products.filter(p => p.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (list.length) html += `<div class="sec-label">${label.toUpperCase()}</div>${list.map(prow).join('')}`;
  }
  return html || '<p class="empty">No products yet</p>';
}
const COMMON_MATERIALS = ['Normal', 'SS', 'Iron', 'Plastic', 'Copper', 'Aluminium', 'Brass'];
const COMMON_BRANDS = ['Branded', 'Local'];
function varRowHtml(v) {
  const f = (k, cap, ph, list, mode = 'text') => `<label class="vf"><small>${cap}</small><input class="input" data-f="${k}" ${list ? `list="${list}"` : ''} ${mode === 'num' ? 'inputmode="decimal"' : ''} value="${esc(k === 'price' ? (v.price ? Math.abs(v.price) : '') : v[k] || '')}" placeholder="${ph}"></label>`;
  return `<div class="var-row" data-id="${v.id || ''}">
    ${f('size', 'Size', 'e.g. 2.5 mm', 'dlSize')}${f('brand', 'Brand', 'e.g. Havells', 'dlBrand')}${f('material', 'Material', 'e.g. SS', 'dlMaterial')}${f('price', 'Price ₹', '0', '', 'num')}
    <div class="var-btns"><button type="button" class="link" data-act="copyVarRow">⧉ Copy</button><button type="button" class="link danger-link" data-act="delVarRow">✕ Remove</button></div></div>`;
}
function varDatalists() {
  const all = k => [...new Set(S.products.flatMap(p => (p.variants || []).map(v => v[k])).filter(Boolean))];
  const dl = (id, vals) => `<datalist id="${id}">${[...new Set(vals)].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  return dl('dlSize', all('size')) + dl('dlBrand', [...all('brand'), ...COMMON_BRANDS]) + dl('dlMaterial', [...all('material'), ...COMMON_MATERIALS]);
}
function viewProductForm(id) {
  const isNew = id === 'new';
  const p = isNew ? makeProduct({ name: '', category: 'PIECE', price: 0 }) : getProduct(id);
  if (!p) return S.loaded.products ? go('/products', true) : '<div class="boot">Loading…</div>';
  const sign = p.price < 0 || (isNew && p.category === 'SCRAP') ? -1 : 1;
  const opts = (obj, sel, fn) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${fn(v, k)}</option>`).join('');
  const missing = missingInfo(p);
  return `${topbar(isNew ? 'New product' : 'Edit product', '/products')}
  <main class="page">
    ${missing.length ? `<div class="card inc-card"><b>⚠ Details missing: ${missing.join(', ')}</b>
      <p class="hint">Added while billing${p.addedBy ? ` by ${esc(p.addedBy)}` : ''} on ${fmtDate(p.createdAt)}. Fill in what you know and tap Save.</p></div>` : ''}
    <form id="prodForm" class="form" data-id="${isNew ? '' : p.id}" autocomplete="off">
      <label class="lbl" for="pfName">PRODUCT NAME *</label>
      <input id="pfName" name="name" class="input big" value="${esc(p.name)}" placeholder="e.g. Copper Wire">
      <label class="lbl">CATEGORY</label>
      <div class="seg">${Object.entries(CATEGORIES).map(([k, v]) => `<label><input type="radio" name="category" value="${k}" ${p.category === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
      <div class="two">
        <div><label class="lbl" for="pfUnit">UNIT</label><select id="pfUnit" name="unit" class="input big">${opts(UNITS, p.unit, v => v.name)}</select></div>
        <div><label class="lbl" for="pfPT">PRICE TYPE</label><select id="pfPT" name="priceType" class="input big">${opts(PRICE_TYPES, p.priceType, v => v.label.toUpperCase())}</select></div>
      </div>
      <label class="lbl">PRICE</label>
      <div class="seg">
        <label><input type="radio" name="sign" value="1" ${sign > 0 ? 'checked' : ''}><span>＋ We sell (adds)</span></label>
        <label class="neg-opt"><input type="radio" name="sign" value="-1" ${sign < 0 ? 'checked' : ''}><span>− Scrap / buy-back (deducts)</span></label>
      </div>
      <div class="base-price" ${p.variantsOn ? 'hidden' : ''}><div class="price-row"><span>₹</span><input name="price" class="input big" inputmode="decimal" value="${p.price ? Math.abs(p.price) : ''}" placeholder="0"></div>
      <p class="hint">Leave 0 to type the rate at billing time (for "Other" items).</p></div>
      <label class="check var-switch"><input type="checkbox" name="variantsOn" id="pfVarOn" ${p.variantsOn ? 'checked' : ''}> Comes in different sizes / brands / materials (price for each)</label>
      <section id="varSection" class="card var-card" ${p.variantsOn ? '' : 'hidden'}>
        <h2>Sizes · Brands · Materials</h2>
        <p class="hint">One row for each combination with its own price. Leave a box empty if it doesn't apply.</p>
        <div id="varRows">${(p.variants || []).map(varRowHtml).join('') || varRowHtml({})}</div>
        <button type="button" class="btn-mid" data-act="addVarRow">＋ Add row</button>
      </section>
      ${varDatalists()}
      <label class="lbl" for="pfSku">SKU / CODE (optional)</label>
      <input id="pfSku" name="sku" class="input big" value="${esc(p.sku)}">
      <div class="two">
        <div><label class="lbl" for="pfStock">STOCK (optional)</label><input id="pfStock" name="stock" class="input big" inputmode="decimal" value="${p.stock ?? ''}"></div>
        <div><label class="lbl" for="pfMin">MIN. STOCK</label><input id="pfMin" name="minStock" class="input big" inputmode="decimal" value="${p.minStock ?? ''}"></div>
      </div>
      <label class="lbl" for="pfBox">BOX / PACKING WEIGHT (kg) — for wire bundles</label>
      <input id="pfBox" name="boxWeight" class="input big" inputmode="decimal" value="${p.boxWeight ?? ''}" placeholder="e.g. 0.300">
      <label class="check"><input type="checkbox" name="allowDecimal" ${p.allowDecimal ? 'checked' : ''}> Allow decimal quantity (e.g. 2.5)</label>
      <label class="check"><input type="checkbox" name="hasSize" ${asksSize(p) ? 'checked' : ''}> Ask wire size when billing (e.g. 1.0, 0.9, 1.3)</label>
      <label class="check"><input type="checkbox" name="favourite" ${p.favourite ? 'checked' : ''}> ⭐ Quick item (show at top)</label>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active (show when billing)</label>
      <button class="btn-big go" type="submit">SAVE PRODUCT</button>
      ${isNew ? '' : `<button type="button" class="btn-text danger" data-act="deleteProduct" data-id="${p.id}">Delete product</button>`}
    </form>
  </main>`;
}

// --- reports
const PERIODS = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month', lastmonth: 'Last month', custom: 'Custom' };
const rep = { period: 'today', from: '', to: '', tab: 'summary', loading: false, offline: false };
const pad2 = n => String(n).padStart(2, '0');
const dayKey = x => {
  const d = new Date(x);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
function periodRange(period = rep.period, fromStr = rep.from, toStr = rep.to) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let from;
  let to;
  switch (period) {
    case 'yesterday': from = addDays(d, -1); to = d; break;
    case 'week': from = addDays(d, -((d.getDay() + 6) % 7)); to = addDays(from, 7); break; // Monday start
    case 'month': from = new Date(d.getFullYear(), d.getMonth(), 1); to = new Date(d.getFullYear(), d.getMonth() + 1, 1); break;
    case 'lastmonth': from = new Date(d.getFullYear(), d.getMonth() - 1, 1); to = new Date(d.getFullYear(), d.getMonth(), 1); break;
    case 'custom':
      from = fromStr ? new Date(fromStr + 'T00:00') : addDays(d, -6);
      to = addDays(toStr ? new Date(toStr + 'T00:00') : d, 1);
      break;
    default: from = d; to = addDays(d, 1);
  }
  const last = addDays(to, -1);
  const label = dayKey(from) === dayKey(last) ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(last)}`;
  return { from: from.toISOString(), to: to.toISOString(), fromD: from, toD: to, label };
}
// Bills older than the live window are fetched once per range when needed.
const fetchedRanges = new Set();
function ensureRange(r) {
  rep.offline = false;
  if (r.from >= recentCutoff() || fetchedRanges.has(r.from + r.to)) return;
  if (!navigator.onLine) {
    rep.offline = true;
    return;
  }
  fetchedRanges.add(r.from + r.to);
  rep.loading = true;
  cloud.loadBillsCompletedBetween(r.from, r.to).then(rows => {
    const fresh = rows.map(billFromDoc);
    const ids = new Set(fresh.map(b => b.id));
    S.olderBills = S.olderBills.filter(b => !ids.has(b.id)).concat(fresh);
    rep.loading = false;
    render(true);
  }).catch(e => {
    fetchedRanges.delete(r.from + r.to);
    rep.loading = false;
    toast('Could not load older bills: ' + e.message, 'err');
    render(true);
  });
}
const billsIn = r => allBills().filter(b => b.status === 'COMPLETED' && b.completedAt >= r.from && b.completedAt < r.to);

function summarize(bills, r) {
  let sales = 0, scrap = 0, scrapKg = 0;
  for (const b of bills) for (const it of b.items) {
    if (it.amount >= 0) sales += it.amount;
    else {
      scrap += it.amount;
      if (it.unit === 'KG') scrapKg += it.quantity;
    }
  }
  const net = round2(bills.reduce((s, b) => s + b.total, 0));
  const pays = allBills().flatMap(b => b.payments || []).filter(p => p.at >= r.from && p.at < r.to);
  return {
    count: bills.length, net, sales: round2(sales), scrap: round2(scrap), scrapKg: round3(scrapKg),
    avg: bills.length ? round2(net / bills.length) : 0,
    received: round2(pays.filter(p => p.amount > 0).reduce((s, p) => s + p.amount, 0)),
    paidOut: round2(pays.filter(p => p.amount < 0).reduce((s, p) => s + p.amount, 0)),
    dueFromPeriod: round2(bills.filter(b => !b.isSettled).reduce((s, b) => s + b.balance, 0)),
  };
}
const reportKey = it => (it.productId || 'n:' + it.productName.toLowerCase()) + (it.variant || it.size ? '|' + (it.variant || it.size) : '');
function productStats(bills) {
  const map = new Map();
  for (const b of bills) for (const it of b.items) {
    if (it.pending) continue;
    const key = reportKey(it);
    const e = map.get(key) || { key, name: itemTitle(it), unit: it.unit, qty: 0, amount: 0, bills: new Set() };
    if (e.unit === it.unit) e.qty = round3(e.qty + it.quantity);
    e.amount = round2(e.amount + it.amount);
    e.bills.add(b.id);
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
function customerStats(bills) {
  const map = new Map();
  const dues = new Map(duesByCustomer().map(g => [g.key, g.balance]));
  for (const b of bills) {
    const key = custKey(b);
    const e = map.get(key) || { key, name: custKeyName(key, b), bills: 0, net: 0, due: dues.get(key) || 0 };
    e.bills++;
    e.net = round2(e.net + b.total);
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}
// Per-day (or per-month for long ranges) totals for a simple bar chart.
function series(r, valueOf) {
  const days = Math.round((r.toD - r.fromD) / 864e5);
  const monthly = days > 62;
  const buckets = new Map();
  const end = new Date(Math.min(r.toD, addDays(new Date().setHours(0, 0, 0, 0), 1))); // no future days
  for (let d = new Date(r.fromD); d < end; d = monthly ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : addDays(d, 1)) {
    const k = monthly ? dayKey(d).slice(0, 7) : dayKey(d);
    buckets.set(k, { label: monthly ? d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' }), value: 0 });
  }
  return { monthly, buckets, add(iso, v) {
    const k = monthly ? dayKey(iso).slice(0, 7) : dayKey(iso);
    if (buckets.has(k)) buckets.get(k).value = round3(buckets.get(k).value + v);
  } };
}
function bars(rows, fmt) {
  const max = Math.max(1e-9, ...rows.map(r => Math.abs(r.value)));
  return `<div class="bars">${rows.map(r => `<div class="bar-row"><span class="bar-lbl">${esc(r.label)}</span>
    <span class="bar"><i class="${r.value < 0 ? 'neg' : ''}" style="width:${Math.round(Math.abs(r.value) / max * 100)}%"></i></span><b class="${r.value < 0 ? 'neg-text' : ''}">${fmt(r.value)}</b></div>`).join('')}</div>`;
}
function periodPicker() {
  return `<nav class="chips">${Object.entries(PERIODS).map(([k, v]) => `<button class="pchip ${rep.period === k ? 'on' : ''}" data-act="setPeriod" data-p="${k}">${v}</button>`).join('')}</nav>
    ${rep.period === 'custom' ? `<div class="two"><div><label class="lbl" for="repFrom">FROM</label><input id="repFrom" type="date" class="input big" data-rep="from" value="${rep.from}"></div>
      <div><label class="lbl" for="repTo">TO</label><input id="repTo" type="date" class="input big" data-rep="to" value="${rep.to}"></div></div>` : ''}`;
}
function rangeNote(r) {
  return `<p class="range-lbl">${r.label}${rep.loading ? ' · <i>loading older bills…</i>' : ''}</p>
    ${rep.offline ? '<p class="hint warn">📴 Offline — older bills for this period can\'t be loaded, totals may be incomplete.</p>' : ''}`;
}
function viewReports() {
  const r = periodRange();
  ensureRange(r);
  const bills = billsIn(r);
  const s = summarize(bills, r);
  const prods = productStats(bills);
  const custs = customerStats(bills);
  const tab = rep.tab;
  let body;
  if (tab === 'products') {
    const sold = prods.filter(p => p.amount >= 0);
    const scrap = prods.filter(p => p.amount < 0);
    const row = p => `<a class="rep-row ${p.amount < 0 ? 'neg' : ''}" href="#/reports/product/${encodeURIComponent(p.key)}">
      <span class="row-main"><b>${esc(p.name)}</b><small>${fmtQty(p.qty, p.unit)} ${unitLabel(p.unit, p.qty)} · ${plural(p.bills.size, 'bill')}</small></span>
      <b class="${p.amount < 0 ? 'neg-text' : ''}">${money(p.amount)}</b><span class="chev">›</span></a>`;
    body = (sold.length ? `<div class="sec-label">SOLD</div><div class="list">${sold.map(row).join('')}</div>` : '') +
      (scrap.length ? `<div class="sec-label">SCRAP / BUY-BACK</div><div class="list">${scrap.map(row).join('')}</div>` : '') ||
      '<p class="empty">No sales in this period</p>';
  } else if (tab === 'customers') {
    body = custs.length ? `<div class="list">${custs.map(c => `<a class="rep-row" href="#/statement/${encodeURIComponent(c.key)}">
      <span class="row-main"><b>${esc(c.name)}</b><small>${plural(c.bills, 'bill')}${c.due ? ` · <span class="tag due">DUE ${money(c.due)}</span>` : ''}</small></span>
      <b>${money(c.net)}</b><span class="chev">›</span></a>`).join('')}</div>` : '<p class="empty">No sales in this period</p>';
  } else {
    const ser = series(r, null);
    bills.forEach(b => ser.add(b.completedAt, b.total));
    const multi = ser.buckets.size > 1;
    body = `<div class="stats">
        <div class="stat big"><span>NET SALES</span><b class="${s.net < 0 ? 'neg-text' : ''}">${money(s.net)}</b><small>${plural(s.count, 'bill')} · avg ${money(s.avg)}</small></div>
        <div class="stat"><span>ITEMS SOLD</span><b>${money(s.sales)}</b></div>
        <div class="stat"><span>SCRAP / RETURN</span><b class="neg-text">${money(s.scrap)}</b>${s.scrapKg ? `<small>${fmtQty(s.scrapKg, 'KG')} kg</small>` : ''}</div>
        <div class="stat"><span>CASH RECEIVED</span><b>${money(s.received)}</b>${s.paidOut ? `<small>paid out ${money(Math.abs(s.paidOut))}</small>` : ''}</div>
        <div class="stat"><span>STILL DUE</span><b class="${s.dueFromPeriod ? 'due-text' : ''}">${money(s.dueFromPeriod)}</b><small>from these bills</small></div>
      </div>
      <a class="row" href="#/dues"><span class="row-main"><b>All dues today: ${money(totalDue())}</b><small>${plural(duesByCustomer().length, 'customer')} owe money</small></span><span class="chev">›</span></a>
      ${multi ? `<div class="sec-label">${ser.monthly ? 'BY MONTH' : 'BY DAY'}</div>${bars([...ser.buckets.values()], money)}` : ''}
      ${prods.length ? `<div class="sec-label">TOP PRODUCTS <button class="link" data-act="setTab" data-t="products">See all</button></div>
        ${bars(prods.filter(p => p.amount > 0).slice(0, 5).map(p => ({ label: p.name, value: p.amount })), money)}` : ''}
      ${custs.length ? `<div class="sec-label">TOP CUSTOMERS <button class="link" data-act="setTab" data-t="customers">See all</button></div>
        ${bars(custs.slice(0, 5).map(c => ({ label: c.name, value: c.net })), money)}` : ''}`;
  }
  return `${topbar('Reports', '/', '<button class="tb-act" data-act="shareReport">📤 Share</button>')}
  <main class="page">
    ${periodPicker()}
    ${rangeNote(r)}
    <div class="seg tabs">${[['summary', 'Summary'], ['products', 'Products'], ['customers', 'Customers']].map(([k, v]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-act="setTab" data-t="${k}">${v}</button>`).join('')}</div>
    ${body}
  </main>`;
}
function reportText() {
  const r = periodRange();
  const bills = billsIn(r);
  const s = summarize(bills, r);
  const prods = productStats(bills);
  return [
    `${S.shop.shopName} — ${PERIODS[rep.period]} (${r.label})`,
    `Net sales: ${money(s.net)} · ${plural(s.count, 'bill')}`,
    `Items sold: ${money(s.sales)}`,
    s.scrap ? `Scrap/return: ${money(s.scrap)}${s.scrapKg ? ` (${fmtQty(s.scrapKg, 'KG')} kg)` : ''}` : '',
    `Cash received: ${money(s.received)}`,
    s.dueFromPeriod ? `Still due from these bills: ${money(s.dueFromPeriod)}` : '',
    '',
    ...prods.map(p => `${p.name}: ${fmtQty(p.qty, p.unit)} ${unitLabel(p.unit, p.qty)} = ${money(p.amount)}`),
  ].filter(x => x !== false && x != null).join('\n').replace(/\n{3,}/g, '\n\n');
}
function viewProductReport(key) {
  const r = periodRange();
  ensureRange(r);
  const bills = billsIn(r);
  const lines = bills.flatMap(b => b.items.filter(it => !it.pending && reportKey(it) === key).map(it => ({ it, b })));
  const name = lines[0] ? itemTitle(lines[0].it) : getProduct(key.split('|')[0])?.name || 'Product';
  const unit = lines[0]?.it.unit || getProduct(key)?.unit || 'PCS';
  const qty = round3(lines.reduce((s, l) => s + l.it.quantity, 0));
  const amount = round2(lines.reduce((s, l) => s + l.it.amount, 0));
  const ser = series(r);
  lines.forEach(l => ser.add(l.b.completedAt, l.it.quantity));
  const byCust = new Map();
  for (const { it, b } of lines) {
    const k = custKey(b);
    const e = byCust.get(k) || { label: custKeyName(k, b), value: 0, amt: 0 };
    e.value = round3(e.value + it.quantity);
    byCust.set(k, e);
  }
  const u = q => `${fmtQty(q, unit)} ${unitLabel(unit, q)}`;
  return `${topbar(esc(name), '/reports')}
  <main class="page">
    ${periodPicker()}
    ${rangeNote(r)}
    <div class="stats">
      <div class="stat big"><span>${amount < 0 ? 'BOUGHT IN' : 'SOLD'}</span><b>${u(qty)}</b><small>${money(amount)} · ${plural(new Set(lines.map(l => l.b.id)).size, 'bill')}${qty ? ` · avg ${money(round2(amount / qty))}/${unitLabel(unit, 1)}` : ''}</small></div>
    </div>
    ${ser.buckets.size > 1 && lines.length ? `<div class="sec-label">${ser.monthly ? 'BY MONTH' : 'BY DAY'}</div>${bars([...ser.buckets.values()], u)}` : ''}
    ${byCust.size ? `<div class="sec-label">BY CUSTOMER</div>${bars([...byCust.values()].sort((a, b) => b.value - a.value).slice(0, 15), u)}` : '<p class="empty">Not sold in this period</p>'}
  </main>`;
}

// --- customer statement & dues
function viewStatement(key) {
  const c = getCustomer(key);
  const sample = allBills().find(b => custKey(b) === key);
  if (!c && !sample) return S.loaded.bills ? go('/customers', true) : '<div class="boot">Loading…</div>';
  const name = c?.name || custKeyName(key, sample);
  const r = periodRange();
  ensureRange(r);
  const unpaid = unpaidBills().filter(b => custKey(b) === key);
  const due = round2(unpaid.reduce((s, b) => s + b.balance, 0));
  const bills = billsIn(r).filter(b => custKey(b) === key).sort(byTime('completedAt')).reverse();
  const net = round2(bills.reduce((s, b) => s + b.total, 0));
  const billRow = b => `<button class="hrow" data-act="openReceipt" data-id="${b.id}">
    <span class="h-time">${fmtDate(b.completedAt).slice(0, 6)}</span>
    <span class="h-main"><b>${billLabel(b)}</b><small>${plural(b.items.length, 'item')}${b.isSettled ? ' · paid' : `${b.wireOut ? ' · <span class="tag bundle">WIRE OUT</span>' : ''}${Math.abs(b.balance) >= 0.005 ? ` · <span class="tag due">DUE ${money(Math.abs(b.balance))}</span>` : ''}`}</small></span>
    <span class="h-amt ${b.total < 0 ? 'neg-text' : ''}">${money(b.total)}</span></button>`;
  return `${topbar(esc(name), c ? '/customers' : '/dues', '<button class="tb-act" data-act="shareStatement" data-key="' + esc(key) + '">📤</button>')}
  <main class="page">
    ${c ? `<p class="hint">${esc([c.phone, c.address, c.notes].filter(Boolean).join(' · '))}</p>` : ''}
    <section class="card ${due > 0 ? 'due-card' : ''}">
      ${due > 0 ? `<p class="due-big">Owes <b>${money(due)}</b></p><p class="hint">${plural(unpaid.length, 'unpaid bill')} · oldest ${fmtDate(unpaid[0].completedAt)}</p>
        <button class="btn-big go" data-act="payCustomer" data-key="${esc(key)}">₹ RECEIVE PAYMENT</button>`
        : due < 0 ? `<p class="due-big">You owe <b>${money(Math.abs(due))}</b></p>` : '<p class="settled-note">✓ No dues</p>'}
      <a class="btn-mid settle-btn" href="#/settle/${encodeURIComponent(key)}">🧾 SETTLEMENT BILL</a>
    </section>
    ${(() => {
      const out = openBundles().filter(bd => custKey(bd) === key);
      return out.length ? `<div class="sec-label">WIRE BUNDLES OUT</div><div class="list">${out.map(bundleRow).join('')}</div>` : '';
    })()}
    ${unpaid.length ? `<div class="sec-label">UNPAID BILLS</div><div class="list">${unpaid.map(billRow).join('')}</div>` : ''}
    ${c ? `<div class="btn-row"><button class="btn-mid" data-act="billForCustomer" data-id="${c.id}">＋ New bill</button><a class="btn-mid" href="#/customer/${c.id}">✎ Edit details</a></div>` : ''}
    <div class="sec-label">BILLS</div>
    ${periodPicker()}
    ${rangeNote(r)}
    ${bills.length ? `<p class="hint">${plural(bills.length, 'bill')} · total ${money(net)}</p><div class="list">${bills.map(billRow).join('')}</div>` : '<p class="empty">No bills in this period</p>'}
  </main>`;
}
function statementText(key) {
  const unpaid = unpaidBills().filter(b => custKey(b) === key);
  const name = custKeyName(key, unpaid[0] || allBills().find(b => custKey(b) === key));
  const due = round2(unpaid.reduce((s, b) => s + b.balance, 0));
  return [
    `${S.shop.shopName}`, `Statement for ${name} · ${fmtDate(now())}`, '------------------------------',
    ...unpaid.map(b => `Bill ${billLabel(b)} · ${fmtDate(b.completedAt)}: total ${money(b.total)}, due ${money(b.balance)}`),
    '------------------------------', due ? `TOTAL DUE: ${money(due)}` : 'No dues. Thank you!',
  ].join('\n');
}
// Dues: by customer (who owes how much) or by date (which day's bills are still unpaid).
const duesView = { tab: local.get('duesTab', 'customer'), period: 'all' };
const DUE_PERIODS = { all: 'All', today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month' };
function viewDues() {
  const groups = duesByCustomer();
  const total = totalDue();
  const days = iso => {
    const n = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
  };
  const tabs = `<div class="seg tabs">${[['customer', 'By customer'], ['date', 'By date']].map(([k, v]) => `<button type="button" class="${duesView.tab === k ? 'on' : ''}" data-act="duesTab" data-t="${k}">${v}</button>`).join('')}</div>`;
  let body;
  if (duesView.tab === 'date') {
    const r = duesView.period === 'all' ? null : periodRange(duesView.period);
    const inRange = iso => !r || (iso >= r.from && iso < r.to);
    const bills = unpaidBills().filter(b => (Math.abs(b.balance) >= 0.005 || b.wireOut) && inRange(b.completedAt)).sort(byTime('completedAt')).reverse();
    const due = round2(bills.reduce((t, b) => t + b.balance, 0));
    const received = r ? round2(allBills().flatMap(b => b.payments || []).filter(p => p.amount > 0 && inRange(p.at)).reduce((t, p) => t + p.amount, 0)) : null;
    const groupsByDay = [];
    for (const b of bills) {
      const d = dayKey(b.completedAt);
      if (!groupsByDay.length || groupsByDay.at(-1).d !== d) groupsByDay.push({ d, at: b.completedAt, bills: [] });
      groupsByDay.at(-1).bills.push(b);
    }
    const today = dayKey(new Date());
    const yest = dayKey(addDays(new Date(), -1));
    const dayName = g => (g.d === today ? 'Today · ' : g.d === yest ? 'Yesterday · ' : '') + fmtDate(g.at);
    body = `<nav class="chips">${Object.entries(DUE_PERIODS).map(([k, v]) => `<button class="pchip ${duesView.period === k ? 'on' : ''}" data-act="duesPeriod" data-p="${k}">${v}</button>`).join('')}</nav>
      ${r ? `<div class="stats">
        <div class="stat"><span>STILL DUE</span><b class="${due > 0 ? 'due-text' : ''}">${money(due)}</b><small>from ${plural(bills.length, 'bill')} made ${DUE_PERIODS[duesView.period].toLowerCase()}</small></div>
        <div class="stat"><span>CASH RECEIVED</span><b>${money(received)}</b><small>${DUE_PERIODS[duesView.period].toLowerCase()}</small></div></div>` : ''}
      ${groupsByDay.length ? groupsByDay.map(g => {
        const t = round2(g.bills.reduce((x, b) => x + b.balance, 0));
        return `<div class="day-head"><span>${dayName(g)}</span><span>${plural(g.bills.length, 'bill')} · ${money(t)}</span></div>
          <div class="list">${g.bills.map(b => `<button class="hrow" data-act="openReceipt" data-id="${b.id}">
            <span class="h-time">${fmtTime(b.completedAt)}</span>
            <span class="h-main"><b>${esc(billName(b))}</b><small>${billLabel(b)} · total ${money(b.total)}${b.paid ? ` · paid ${money(b.paid)}` : ''}${b.wireOut ? ' · <span class="tag bundle">WIRE OUT</span>' : ''}</small></span>
            <span class="due-amt">DUE<b>${money(b.balance)}</b></span></button>`).join('')}</div>`;
      }).join('') : `<p class="empty">${r ? 'No unpaid bills from this period 🎉' : '🎉 Nobody owes anything'}</p>`}`;
  } else {
    body = groups.length ? `<div class="list">${groups.map(g => `<a class="row" href="#/statement/${encodeURIComponent(g.key)}">
      <span class="row-main"><b>${esc(g.name)}</b><small>${plural(g.bills.length, 'bill')} · oldest ${days(g.bills[0].completedAt)}</small></span>
      <span class="due-amt">${g.balance < 0 ? 'WE OWE' : 'DUE'}<b>${money(Math.abs(g.balance))}</b></span><span class="chev">›</span></a>`).join('')}</div>` : '<p class="empty">🎉 Nobody owes anything</p>';
  }
  return `${topbar('Dues', '/')}
  <main class="page">
    <section class="card ${total > 0 ? 'due-card' : ''}"><p class="due-big">Total due <b>${money(total)}</b></p><p class="hint">${plural(groups.length, 'customer')} · ${plural(unpaidBills().filter(b => Math.abs(b.balance) >= 0.005).length, 'unpaid bill')}</p></section>
    ${tabs}
    ${body}
  </main>`;
}

// --- wire bundles
const bundleRow = bd => `<a class="row" href="#/bundle/${bd.id}">
  <span class="row-main"><b>${esc(bd.customerName || 'Walk-in customer')}</b><small>${esc(bundleTitle(bd))} · ${kg(bd.outWeight)} kg ${bd.packing === 'BS' ? 'BS' : 'Net'} · ${fmtDate(bd.outAt)}</small></span>
  ${bd.status === 'OUT' ? `<span class="due-amt">${Math.max(0, Math.floor((Date.now() - new Date(bd.outAt)) / 864e5))} DAYS</span>` : `<span class="due-amt ok">USED<b>${kg(bd.usedKg || 0)} kg</b></span>`}<span class="chev">›</span></a>`;
function viewBundles() {
  const out = openBundles();
  const back = S.bundles.filter(b => b.status === 'RETURNED').sort(byTime('returnAt')).reverse().slice(0, 50);
  return `${topbar('Wire bundles', '/')}
  <main class="page">
    <a class="btn-big go" href="#/bundle/new">＋ GIVE BUNDLE</a>
    <div class="sec-label">OUT WITH CUSTOMERS</div>
    ${out.length ? `<div class="list">${out.map(bundleRow).join('')}</div>` : '<p class="empty">No bundles out</p>'}
    ${back.length ? `<div class="sec-label">RETURNED (RECENT)</div><div class="list">${back.map(bundleRow).join('')}</div>` : ''}
  </main>`;
}
// Draft for the "give bundle" screen survives re-renders while typing.
let bnDraft = null;
const wireProducts = () => S.products.filter(p => p.active && (p.unit === 'KG' || p.category === 'WEIGHT') && p.price >= 0)
  .sort((a, b) => (b.boxWeight != null) - (a.boxWeight != null) || a.name.localeCompare(b.name));
const newBundleDraft = extra => ({ customerId: null, customerName: '', customerPhone: '', productId: null, packing: 'BS', out: '', box: '', saveBox: true, note: '', billId: null, ...extra });
function bundleFormHtml(d) {
  const p = d.productId ? getProduct(d.productId) : null;
  return `<label class="lbl">WIRE</label>
    <div class="ptiles">${wireProducts().map(w => `<button type="button" class="ptile ${w.id === d.productId ? 'sel' : ''}" data-act="bnPickProduct" data-id="${w.id}">
      <span class="pt-name">${esc(w.name)}</span><span class="pt-rate">${w.price ? rateText(w.price, w.priceType) : 'Enter rate'}${w.boxWeight ? ` · box ${kg(w.boxWeight)}` : ''}</span></button>`).join('') || '<p class="empty">Add wire products (unit KG) under Products first.</p>'}</div>
    ${p && hasVariants(p) ? variantPicker(p, d.varSel || {}, 'bnVariant') : ''}
    ${p && asksSize(p) ? sizePicker(p, d.size, 'bnSize', 'bnSizeIn') : ''}
    <label class="lbl" for="bnOut">WEIGHT GIVEN (kg) — as shown on the scale</label>
    <input id="bnOut" class="qty-input" inputmode="decimal" autocomplete="off" value="${esc(d.out)}" placeholder="0.000">
    <label class="lbl">PACKING</label>
    <div class="seg sign">
      <button type="button" class="${d.packing === 'BS' ? 'on' : ''}" data-act="bnPacking" data-p="BS">BS — with box</button>
      <button type="button" class="${d.packing === 'NET' ? 'on' : ''}" data-act="bnPacking" data-p="NET">Net — wire only</button>
    </div>
    ${d.packing === 'BS' ? `<label class="lbl" for="bnBox">BOX WEIGHT (kg)</label>
      <input id="bnBox" class="input big" inputmode="decimal" autocomplete="off" value="${esc(d.box)}" placeholder="0.300">
      ${p ? `<label class="check"><input type="checkbox" id="bnSaveBox" ${d.saveBox ? 'checked' : ''}> Remember this box weight for ${esc(p.name)}</label>` : ''}` : ''}
    <label class="lbl" for="bnNote">NOTE (optional)</label>
    <input id="bnNote" class="input big" autocomplete="off" value="${esc(d.note)}" placeholder="e.g. for motor rewinding">
    <div class="calc" id="bnCalc"></div>
    <button type="button" class="btn-big go" id="bnGo" data-act="bnGive">GIVE BUNDLE</button>`;
}
function viewBundleNew() {
  if (!bnDraft || bnDraft.billId) bnDraft = newBundleDraft();
  const d = bnDraft;
  return `${topbar('Give bundle', '/bundles')}
  <main class="page">
    <label class="lbl">CUSTOMER</label>
    ${d.customerName ? `<div class="pick-done"><b>${esc(d.customerName)}</b><button type="button" class="link" data-act="bnClearCustomer">change</button></div>`
      : `<div class="search-row"><input id="bnCust" class="input big" type="search" placeholder="Type or 🎤 speak name" autocomplete="off">${micBtn('bnCust')}</div>
         <div id="bnCustResults" class="list">${bnCustomerResults('')}</div>`}
    <p class="hint">The bundle is added to this customer's open bill as “awaiting return”, so other items can go on the same bill.</p>
    ${bundleFormHtml(d)}
  </main>`;
}
// From the billing screen: the customer is the bill's customer.
function openBundleSheet(billId) {
  const bill = getBill(billId);
  if (!bnDraft || bnDraft.billId !== billId) bnDraft = newBundleDraft({ billId, customerName: billName(bill) });
  openSheet(`<div class="sheet-head"><div><div class="sh-title">Give wire bundle</div><div class="sh-sub">${esc(billName(bill))} · goes on this bill, billed when returned</div></div>
    <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button></div>
    ${bundleFormHtml(bnDraft)}`);
  updateBundleNew();
}
const refreshBundleForm = () => (bnDraft?.billId && !$('#sheet').hidden ? openBundleSheet(bnDraft.billId) : render(true));
function bnCustomerResults(q) {
  const list = searchCustomers(q).slice(0, 8);
  let html = list.map(c => `<button type="button" class="row" data-act="bnPickCustomer" data-id="${c.id}"><span class="row-main"><b>${esc(c.name)}</b>${c.phone ? `<small>${esc(c.phone)}</small>` : ''}</span><span class="chev">›</span></button>`).join('');
  if (q.trim()) html += `<button type="button" class="row accent" data-act="bnTypedCustomer"><span class="row-main"><b>Use “${esc(q.trim())}”</b><small>One-off — not saved to customers</small></span><span class="chev">›</span></button>`;
  return html || '<p class="empty">No saved customers yet.<br>Type or speak a name above.</p>';
}
function updateBundleNew() {
  const d = bnDraft;
  if (!d || !$('#bnCalc')) return;
  const out = num(d.out) || 0;
  const box = d.packing === 'BS' ? num(d.box) || 0 : 0;
  const needSize = (asksSize(getProduct(d.productId)) && !d.size) || (hasVariants(getProduct(d.productId)) && !d.variant);
  const ready = d.customerName && d.productId && out > 0 && box < out && !needSize;
  $('#bnCalc').innerHTML = out > 0
    ? (box ? `<span>${kg(out)} kg − box ${kg(box)} kg</span><b>Wire given: ${kg(out - box)} kg</b>` : `<b>Wire given: ${kg(out)} kg</b>`)
    : `<span>${!d.customerName ? 'Choose customer' : !d.productId ? 'Choose wire' : 'Enter weight'}</span><b>&nbsp;</b>`;
  if (out > 0 && needSize) $('#bnCalc').innerHTML += `<span class="warn-text">${d.variant === undefined || !hasVariants(getProduct(d.productId)) ? 'Choose wire size' : 'Choose size / brand / material'}</span>`;
  $('#bnGo').disabled = !ready;
}
function viewBundleReturn(id, billId) {
  const bd = getBundle(id);
  if (!bd) return S.loaded.bundles ? go('/bundles', true) : '<div class="boot">Loading…</div>';
  const p = getProduct(bd.productId);
  const bill = bd.billId ? getBill(bd.billId) : null;
  const billOpen = bill && bill.status !== 'CANCELLED';
  const billLink = bill ? `<a class="btn-mid" href="#${billHref(bill)}">Open bill ${billLabel(bill)}</a>` : '';
  const head = `<section class="card">
      <p class="due-big"><b>${esc(bd.customerName || 'Walk-in customer')}</b></p>
      <p>${esc(bundleTitle(bd))} · <b>${kg(bd.outWeight)} kg</b> ${bd.packing === 'BS' ? `BS (box ${kg(bd.boxWeight || 0)} kg)` : 'Net'}</p>
      <p class="hint">Given ${fmtDate(bd.outAt)}, ${fmtTime(bd.outAt)}${bd.note ? ' · ' + esc(bd.note) : ''}</p></section>`;
  if (bd.status !== 'OUT') {
    return `${topbar('Bundle', '/bundles')}
    <main class="page">${head}
      <section class="card"><h2>Returned ${fmtDate(bd.returnAt)}</h2>
        ${noteLines(bd.returnNote).map(l => `<p>${esc(l)}</p>`).join('')}
        ${bd.usedKg ? `<p><b>${kg(bd.usedKg)} kg × ${money(bd.rate)} = ${money(bd.amount)}</b></p>` : ''}</section>
      ${billLink}
      ${billOpen ? '<button type="button" class="btn-mid" data-act="brUndo">↩ Re-enter returned weight</button>' : ''}
    </main>`;
  }
  const curRate = bd.variantId ? p?.variants?.find(v => v.id === bd.variantId)?.price : p?.price;
  if (!bnReturn || bnReturn.id !== id) bnReturn = { id, mode: 'some', back: '', withBox: true, rate: String(curRate || bd.rate || '') };
  const r = bnReturn;
  return `${topbar('Return bundle', billId ? `/bill/${billId}` : '/bundles')}
  <main class="page">${head}
    <div class="seg sign">
      <button type="button" class="${r.mode === 'some' ? 'on' : ''}" data-act="brMode" data-m="some">Wire returned</button>
      <button type="button" class="${r.mode === 'all' ? 'on' : ''}" data-act="brMode" data-m="all">Used all</button>
    </div>
    ${r.mode === 'some' ? `<label class="lbl" for="brBack">WEIGHT RETURNED (kg)</label>
      <input id="brBack" class="qty-input" inputmode="decimal" autocomplete="off" value="${esc(r.back)}" placeholder="0.000">
      ${bd.packing === 'BS' ? `<label class="check"><input type="checkbox" id="brWithBox" ${r.withBox ? 'checked' : ''}> Returned with the box</label>` : ''}` : ''}
    <label class="lbl" for="brRate">RATE ₹ / kg</label>
    <input id="brRate" class="input big" inputmode="decimal" autocomplete="off" value="${esc(r.rate)}">
    <div class="calc" id="brCalc"></div>
    <button type="button" class="btn-big go" id="brGo" data-act="brConfirm">ADD TO CUSTOMER'S BILL</button>
    ${billLink}
    <button type="button" class="btn-text danger" data-act="brDelete">Delete this bundle entry</button>
  </main>`;
}
let bnReturn = null;
function readReturn() {
  const bd = getBundle(bnReturn.id);
  const back = bnReturn.mode === 'all' ? 0 : num(bnReturn.back) || 0;
  const c = bundleCalc(bd, back, bnReturn.withBox);
  const rate = num(bnReturn.rate) || 0;
  return { bd, ...c, rate, amount: lineAmount(c.used, rate, 'KG', 'PER_KG') };
}
function updateBundleReturn() {
  if (!bnReturn || !$('#brCalc')) return;
  const f = readReturn();
  const typed = bnReturn.mode === 'all' || num(bnReturn.back) > 0;
  const ok = typed && f.used >= 0 && (f.used === 0 || f.rate > 0);
  $('#brCalc').innerHTML = !typed ? '<span>Enter weight returned</span><b>&nbsp;</b>'
    : f.used < 0 ? `<span class="neg-text">Returned more than given — check the weight</span><b>&nbsp;</b>`
    : `${noteLines(f.note).map(l => `<span class="calc-line">${esc(l)}</span>`).join('')}<b>${kg(f.used)} kg × ${money(f.rate)} = ${money(f.amount)}</b>`;
  $('#brGo').disabled = !ok;
  $('#brGo').textContent = typed && f.used === 0 ? 'CLOSE BUNDLE (NOTHING USED)' : 'ADD TO CUSTOMER\'S BILL';
}
// --- quick calculator: price for any weight / length / quantity, and estimates
// Kept on this phone only (not synced); "Make bill" turns the estimate into a real bill.
const calc = Object.assign({ productId: null, varSel: {}, variant: null, rate: '', qty: '', lines: [] }, local.get('calc', {}));
const saveCalc = () => local.set('calc', { ...calc, varSel: calc.varSel, variant: calc.variant });
function calcLine() {
  const p = getProduct(calc.productId);
  if (!p) return null;
  const qty = num(calc.qty) || 0;
  const neg = (calc.variant ? calc.variant.price : p.price) < 0 || (!p.price && p.category === 'SCRAP');
  const rate = (neg ? -1 : 1) * Math.abs(num(calc.rate) || 0);
  return { p, qty, rate, amount: lineAmount(qty, rate, p.unit, p.priceType), label: withSize(p.name, calc.variant ? variantLabel(calc.variant) : '') };
}
function viewCalc() {
  const p = getProduct(calc.productId);
  const total = round2(calc.lines.reduce((t, l) => t + l.amount, 0));
  return `${topbar('Quick calculator', '/', calc.lines.length ? '<button class="tb-act" data-act="calcShare">📤 Share</button>' : '')}
  <main class="page">
    ${p ? `<section class="card calc-card">
      <div class="calc-head"><b>${esc(p.name)}</b><button type="button" class="link" data-act="calcClose">change</button></div>
      ${hasVariants(p) ? `<div id="calcVarBox">${variantPicker(p, calc.varSel, 'calcVariant')}</div>` : ''}
      <div class="two">
        <div><label class="lbl" for="calcQty">${qtyWord(p.unit)} (${UNITS[p.unit]?.label || ''})</label>
          <input id="calcQty" class="qty-input" inputmode="decimal" autocomplete="off" value="${esc(calc.qty)}" placeholder="0" enterkeyhint="done"></div>
        <div><label class="lbl" for="calcRate">RATE ₹${PRICE_TYPES[p.priceType]?.per ? ' / ' + PRICE_TYPES[p.priceType].per : ''}</label>
          <input id="calcRate" class="qty-input rate" inputmode="decimal" autocomplete="off" value="${esc(calc.rate)}" placeholder="0"></div>
      </div>
      <div class="calc big-calc" id="calcResult"></div>
      <button type="button" class="btn-big go" id="calcAdd" data-act="calcAdd">＋ ADD TO ESTIMATE</button>
    </section>` : '<p class="hint">Tap a product, then type the weight / length / quantity.</p>'}
    ${calc.lines.length ? `<section class="card"><h2>Estimate</h2>
      ${calc.lines.map((l, i) => `<div class="pay-row"><span><b>${esc(l.label)}</b><small>${fmtQty(l.qty, l.unit)} ${unitLabel(l.unit, l.qty)} × ${money(l.rate)}</small></span>
        <b class="${l.amount < 0 ? 'neg-text' : ''}">${money(l.amount)}</b><button type="button" class="x" data-act="calcDel" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}
      <div class="total-row"><span>TOTAL</span><b class="${total < 0 ? 'neg-text' : ''}">${money(total)}</b></div>
      <div class="btn-row"><button type="button" class="btn-mid" data-act="calcClear">Clear</button><button type="button" class="btn-mid go" data-act="calcToBill">🧾 MAKE BILL</button></div>
    </section>` : ''}
    <input id="calcSearch" class="input big" type="search" placeholder="🔍 Search product…" autocomplete="off">
    <div id="calcResults">${calcResults('')}</div>
  </main>`;
}
function calcResults(q) {
  const html = productPickResults(q).replace(/data-act="pickProduct"/g, 'data-act="calcPick"');
  return html.replace(/<button class="btn-big alt" data-act="quickAdd"[^]*?<\/button>/g, '');
}
function updateCalcPage() {
  const out = $('#calcResult');
  if (!out) return;
  const l = calcLine();
  const p = l?.p;
  const pending = p && hasVariants(p) && !calc.variant;
  if (pending) out.innerHTML = '<span>Choose size / brand / material</span><b>&nbsp;</b>';
  else if (l && l.qty > 0 && l.rate) out.innerHTML = `${fmtQty(l.qty, p.unit)} ${unitLabel(p.unit, l.qty)} × ${money(l.rate)}<b class="${l.amount < 0 ? 'neg-text' : ''}">= ${money(l.amount)}</b>`;
  else out.innerHTML = `<span>${l && l.rate ? 'Enter ' + qtyWord(p.unit).toLowerCase() : 'Enter rate'}</span><b>&nbsp;</b>`;
  $('#calcAdd').disabled = !(l && l.qty > 0 && l.rate && !pending);
}
function calcText() {
  const total = round2(calc.lines.reduce((t, l) => t + l.amount, 0));
  return [`${S.shop.shopName} — ESTIMATE`, `${fmtDate(now())}, ${fmtTime(now())}`, '------------------------------',
    ...calc.lines.map(l => `${l.label}\n  ${fmtQty(l.qty, l.unit)} ${unitLabel(l.unit, l.qty)} × ${money(l.rate)} = ${money(l.amount)}`),
    '------------------------------', `TOTAL: ${money(total)}`, '(Estimate — not a bill)'].join('\n');
}

// --- printable documents
// A document is a list of lines: { t: 'text'|'row'|'rule'|'gap', ... }. The
// same list is drawn on screen, as a print/share image and as plain text.
function docHtml(ops) {
  return `<article class="receipt doc" id="receipt">${ops.map(o => {
    if (o.t === 'rule') return `<hr class="${o.solid ? 'solid' : ''}">`;
    if (o.t === 'gap') return '<div class="d-gap"></div>';
    const cls = `${o.size >= 30 ? 'xl' : o.size >= 26 ? 'lg' : o.size && o.size <= 20 ? 'sm' : ''} ${o.bold ? 'b' : ''} ${o.cls || ''}`;
    if (o.t === 'row') return `<div class="d-row ${cls}"><span>${esc(o.l)}</span><span>${esc(o.r)}</span></div>`;
    return `<div class="d-text ${cls} ${o.align || ''}">${esc(o.s)}</div>`;
  }).join('')}</article>`;
}
function docText(ops) {
  return ops.map(o => (o.t === 'rule' ? '------------------------------' : o.t === 'gap' ? '' : o.t === 'row' ? `${o.l}  ${o.r}` : o.s)).join('\n');
}
function docCanvas(ops) {
  const W = 576;
  const P = 28;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 300 + ops.length * 70;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, c.height);
  g.fillStyle = '#000';
  g.textBaseline = 'top';
  let y = P;
  const font = (size, bold) => (g.font = `${bold ? 700 : 400} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`);
  const wrap = (t, max) => {
    const out = [];
    let line = '';
    for (const w of String(t).split(' ')) {
      const next = line ? line + ' ' + w : w;
      if (g.measureText(next).width > max && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    return out.concat(line ? [line] : []);
  };
  const indent = t => (String(t).match(/^ */)[0].length) * 5; // leading spaces → left margin
  for (const o of ops) {
    const size = o.size || 22;
    if (o.t === 'gap') y += 12;
    else if (o.t === 'rule') {
      g.setLineDash(o.solid ? [] : [8, 6]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(P, y + 6);
      g.lineTo(W - P, y + 6);
      g.stroke();
      y += 20;
    } else if (o.t === 'row') {
      font(size, o.bold);
      const ind = indent(o.l);
      const rw = g.measureText(o.r).width;
      const lines = wrap(o.l.trim(), W - 2 * P - rw - 16 - ind);
      g.textAlign = 'right';
      g.fillText(o.r, W - P, y);
      g.textAlign = 'left';
      lines.forEach(l => {
        g.fillText(l, P + ind, y);
        y += Math.round(size * 1.3);
      });
    } else {
      font(size, o.bold);
      const ind = indent(o.s);
      g.textAlign = o.align || 'left';
      for (const l of wrap(o.s.trim(), W - 2 * P - ind)) {
        g.fillText(l, o.align === 'center' ? W / 2 : P + ind, y);
        y += Math.round(size * 1.3);
      }
    }
  }
  y += P;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.min(y, c.height);
  out.getContext('2d').drawImage(c, 0, 0);
  return out;
}

// --- settlement bill: everything a customer took, returned and paid in a period
const stl = { mode: 'due', from: '', to: '' };
const STL_MODES = { due: 'Since oldest due', week: 'This week', month: 'This month', lastmonth: 'Last month', custom: 'Custom' };
function settleRange(key) {
  if (stl.mode !== 'due') return periodRange(stl.mode, stl.from, stl.to);
  const oldest = unpaidBills().find(b => custKey(b) === key);
  const start = new Date(oldest ? oldest.completedAt : Date.now());
  start.setHours(0, 0, 0, 0);
  const r = { from: start.toISOString(), to: addDays(new Date(new Date().setHours(0, 0, 0, 0)), 1).toISOString(), fromD: start };
  r.toD = new Date(r.to);
  r.label = `${fmtDate(start)} – ${fmtDate(new Date())}`;
  return r;
}
function settlementData(key) {
  const r = settleRange(key);
  ensureRange(r);
  const bills = allBills().filter(b => custKey(b) === key && b.status === 'COMPLETED' && b.completedAt >= r.from && b.completedAt < r.to).sort(byTime('completedAt'));
  const sum = f => round2(bills.reduce((t, b) => t + f(b), 0));
  const sales = sum(b => billSections(b).salesTotal);
  const scrap = sum(b => billSections(b).scrapTotal);
  const billed = sum(b => b.total);
  const paid = sum(b => b.paid);
  const due = sum(b => b.balance);
  const allDue = round2(unpaidBills().filter(b => custKey(b) === key).reduce((t, b) => t + b.balance, 0));
  return { r, bills, sales, scrap, billed, paid, due, olderDue: round2(allDue - due), allDue };
}
function settlementOps(key) {
  const d = settlementData(key);
  const sample = d.bills[0] || allBills().find(b => custKey(b) === key);
  const c = getCustomer(key);
  const name = c?.name || custKeyName(key, sample);
  const phone = c?.phone || sample?.customerPhone || '';
  const when = iso => `${fmtDate(iso).slice(0, 6)}, ${fmtTime(iso)}`;
  const ops = [{ t: 'text', s: S.shop.shopName, size: 32, bold: true, align: 'center' }];
  if (S.shop.shopAddress) ops.push({ t: 'text', s: S.shop.shopAddress, size: 20, align: 'center' });
  if (S.shop.shopPhone) ops.push({ t: 'text', s: 'Ph: ' + S.shop.shopPhone, size: 20, align: 'center' });
  ops.push({ t: 'text', s: 'SETTLEMENT BILL', size: 26, bold: true, align: 'center' }, { t: 'rule' },
    { t: 'text', s: `Customer: ${name}${phone ? ' · ' + phone : ''}`, size: 24, bold: true },
    { t: 'row', l: 'Period', r: d.r.label, size: 20 }, { t: 'row', l: 'Prepared', r: `${fmtDate(now())}, ${fmtTime(now())}`, size: 20 }, { t: 'rule' });
  if (!d.bills.length) ops.push({ t: 'text', s: 'No completed bills in this period.', size: 22 });
  for (const b of d.bills) {
    ops.push({ t: 'row', l: `${fmtDate(b.completedAt)} · Bill ${billLabel(b)}`, r: fmtTime(b.completedAt), size: 23, bold: true });
    if (b.remark) ops.push({ t: 'text', s: `   Note: ${b.remark}`, size: 19 });
    const sec = billSections(b);
    for (const it of [...sec.sales, ...sec.scrap]) {
      const tag = itemPayTag(b, it);
      ops.push({ t: 'row', l: `${fmtTime(it.addedAt || b.createdAt)}  ${itemTitle(it)}${it.amount < 0 ? ' (scrap)' : ''}${tag ? ` [${tag}]` : ''}`, r: amountOrPending(it), size: 22 });
      ops.push({ t: 'text', s: `        ${calcOrPending(it, it.amount < 0)}`, size: 19 });
      const bd = it.bundleId ? getBundle(it.bundleId) : null;
      noteLines(it.note).filter(Boolean).forEach((l, i) => {
        const at = bd && i === 0 ? ` (${when(bd.outAt)})` : bd && i === 1 && bd.returnAt ? ` (${when(bd.returnAt)})` : '';
        ops.push({ t: 'text', s: `        ${l}${at}`, size: 19 });
      });
    }
    ops.push({ t: 'row', l: '   Bill total', r: money(b.total), size: 22, bold: true });
    b.payments.forEach(p => ops.push({ t: 'text', s: `   ${payLine(b, p)}`, size: 19 }));
    if (Math.abs(b.balance) >= 0.005) ops.push({ t: 'row', l: '   Due on this bill', r: money(b.balance), size: 22, bold: true, cls: 'due' });
    if (b.wireOut) ops.push({ t: 'text', s: '   Wire bundle not returned yet — will be added to this bill', size: 19 });
    ops.push({ t: 'rule' });
  }
  const out = openBundles().filter(bd => custKey(bd) === key);
  if (out.length) {
    ops.push({ t: 'text', s: 'WIRE STILL WITH CUSTOMER (not billed yet)', size: 21, bold: true });
    out.forEach(bd => ops.push({ t: 'text', s: `   ${bundleTitle(bd)} · ${bundleGiven(bd)} · ${when(bd.outAt)}`, size: 19 }));
    ops.push({ t: 'rule' });
  }
  ops.push({ t: 'text', s: 'SUMMARY', size: 24, bold: true },
    { t: 'row', l: 'Bills', r: String(d.bills.length) },
    { t: 'row', l: 'Purchases', r: money(d.sales) });
  if (d.scrap) ops.push({ t: 'row', l: 'Scrap taken (minus)', r: money(d.scrap) });
  ops.push({ t: 'row', l: 'Total billed', r: money(d.billed), bold: true }, { t: 'row', l: 'Paid', r: money(d.paid) });
  if (d.olderDue) ops.push({ t: 'row', l: 'Due from these bills', r: money(d.due) }, { t: 'row', l: 'Older dues (before this period)', r: money(d.olderDue) });
  ops.push({ t: 'rule', solid: true }, { t: 'row', l: d.allDue < 0 ? 'TO PAY CUSTOMER' : 'BALANCE DUE', r: money(Math.abs(d.allDue)), size: 30, bold: true },
    { t: 'gap' }, { t: 'text', s: d.allDue ? 'Thank you!' : 'ALL SETTLED — Thank you!', size: 22, bold: true, align: 'center' });
  return { ops, d, name };
}
function viewSettlement(key) {
  const sample = allBills().find(b => custKey(b) === key);
  if (!getCustomer(key) && !sample) return S.loaded.bills ? go('/customers', true) : '<div class="boot">Loading…</div>';
  const { ops, d, name } = settlementOps(key);
  const open = activeBills().filter(b => b.customerChosen && custKey(b) === key);
  return `${topbar('Settlement', `/statement/${encodeURIComponent(key)}`)}
  <main class="page">
    <nav class="chips">${Object.entries(STL_MODES).map(([k, v]) => `<button class="pchip ${stl.mode === k ? 'on' : ''}" data-act="stlMode" data-p="${k}">${v}</button>`).join('')}</nav>
    ${stl.mode === 'custom' ? `<div class="two"><div><label class="lbl" for="stlFrom">FROM</label><input id="stlFrom" type="date" class="input big" data-stl="from" value="${stl.from}"></div>
      <div><label class="lbl" for="stlTo">TO</label><input id="stlTo" type="date" class="input big" data-stl="to" value="${stl.to}"></div></div>` : ''}
    ${rep.loading ? '<p class="hint">Loading older bills…</p>' : ''}
    ${open.map(b => `<a class="bundle-note" href="#/bill/${b.id}">⚠ <span><b>Open bill ${billLabel(b)} not completed</b><small>${plural(b.items.length, 'item')} · ${money(b.total)} — complete it to include it here</small></span><span class="link">Open</span></a>`).join('')}
    ${docHtml(ops)}
    <div class="btn-row">
      <button class="btn-mid" data-act="shareSettlement" data-key="${esc(key)}">📤 SHARE</button>
      <button class="btn-mid" data-act="printSettlement" data-key="${esc(key)}">🖨 PRINT</button>
    </div>
    ${d.allDue > 0 ? `<button class="btn-big go" data-act="payCustomer" data-key="${esc(key)}">₹ RECEIVE PAYMENT (${money(d.allDue)})</button>` : ''}
  </main>`;
}
// Print on screen where the browser allows; otherwise share as an image (iPhone etc.).
function printOrShare(makeCanvas, name, title) {
  const viaImage = () => shareImage(makeCanvas(), name, title, true);
  if (IS_IOS || typeof window.print !== 'function') return viaImage();
  let started = false;
  const mark = () => (started = true);
  window.addEventListener('beforeprint', mark, { once: true });
  window.print();
  setTimeout(() => {
    window.removeEventListener('beforeprint', mark);
    if (!started) viaImage();
  }, 700);
}

// --- receive / record a payment
function openPaySheet(ctx) {
  sheetCtx = { ...ctx, method: 'Cash' };
  const out = ctx.balance < 0;
  openSheet(`
    <div class="sheet-head"><div><div class="sh-title">${out ? 'Record payout' : 'Receive payment'}</div>
      <div class="sh-sub">${esc(ctx.name)} · ${out ? 'to pay' : 'due'} <b>${money(Math.abs(ctx.balance))}</b></div></div>
      <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button></div>
    <label class="lbl" for="payIn">AMOUNT ${out ? 'PAID OUT' : 'RECEIVED'} (₹)</label>
    <input id="payIn" class="qty-input" inputmode="decimal" autocomplete="off" value="${Math.abs(ctx.balance)}">
    <div class="seg sign">${['Cash', 'UPI', 'Other'].map(m => `<button type="button" class="${m === 'Cash' ? 'on' : ''}" data-act="setMethod" data-m="${m}">${m}</button>`).join('')}</div>
    <p class="calc" id="payInfo"></p>
    ${payItemsHtml(ctx)}
    ${ctx.mode === 'customer' ? '<p class="hint">Applied to the oldest unpaid bills first.</p>' : ''}
    <button type="button" class="btn-big go" id="payGo" data-act="savePayment">SAVE PAYMENT</button>`);
  updatePayInfo();
  $('#payIn').focus();
  $('#payIn').select();
}
function payItemsHtml(ctx) {
  if (ctx.mode !== 'bill' || ctx.balance <= 0) return '';
  const b = getBill(ctx.billId);
  const paid = paidItemIds(b);
  const list = b.items.filter(it => !paid.has(it.id) && !it.pending && it.amount);
  if (list.length < 2) return '';
  return `<label class="lbl">WHICH ITEMS ARE PAID NOW? (optional)</label>
    <div class="pay-items">${list.map(it => `<label class="check"><input type="checkbox" class="payItem" value="${it.id}" data-amt="${it.amount}">
      <span>${esc(itemTitle(it))}</span><b class="${it.amount < 0 ? 'neg-text' : ''}">${money(it.amount)}</b></label>`).join('')}</div>
    <p class="hint">Ticked items show as PAID on the bill; the rest stay DUE.</p>`;
}
function updatePayInfo() {
  if (!sheetCtx) return;
  const a = num($('#payIn').value);
  const max = Math.abs(sheetCtx.balance);
  const ok = a > 0 && a <= max + 0.005;
  $('#payInfo').innerHTML = !(a > 0) ? 'Enter amount' : !ok ? `<span class="neg-text">More than ${money(max)}</span>`
    : a >= max - 0.005 ? '<b class="ok-text">Fully settles</b>' : `Leaves <b>${money(round2(max - a))}</b> due`;
  $('#payGo').disabled = !ok;
}

// --- settings
function viewSettings() {
  const s = S.shop;
  const last = local.get('lastBackupAt');
  const counts = `${plural(S.products.length, 'product')} · ${plural(S.customers.length, 'customer')} · ${plural(S.bills.length, 'recent bill')}`;
  return `${topbar('Settings', '/')}
  <main class="page">
    ${langSwitch()}
    <section class="card"><h2>Start screen <small>(this phone)</small></h2>
      <div class="seg sign"><button type="button" class="${local.get('startPage', 'home') === 'home' ? 'on' : ''}" data-act="setStart" data-p="home">Home</button>
        <button type="button" class="${local.get('startPage', 'home') === 'calc' ? 'on' : ''}" data-act="setStart" data-p="calc">🧮 Quick calculator</button></div>
    </section>
    <section class="card"><h2>Account & sync</h2>
      <p>Signed in as <b>${esc(S.user.email)}</b></p>
      <p><span class="sync-badge"></span></p>
      <label class="lbl" for="sDev">BILL LETTER FOR THIS PHONE</label>
      <input id="sDev" class="input big" data-local="deviceCode" maxlength="2" autocapitalize="characters" value="${esc(deviceCode())}">
      <p class="hint">Bills from this phone are numbered ${esc(deviceCode())}-1, ${esc(deviceCode())}-2… Use a different letter on each phone.</p>
      <button class="btn-mid" data-act="signOut">Sign out</button>
    </section>
    <section class="card"><h2>Shop <small>(shared by all phones)</small></h2>
      <label class="lbl" for="sName">SHOP NAME</label><input id="sName" class="input big" data-shop="shopName" value="${esc(s.shopName)}">
      <label class="lbl" for="sAddr">ADDRESS (printed on bill)</label><input id="sAddr" class="input big" data-shop="shopAddress" value="${esc(s.shopAddress)}">
      <label class="lbl" for="sPhone">PHONE (printed on bill)</label><input id="sPhone" class="input big" type="tel" data-shop="shopPhone" value="${esc(s.shopPhone)}">
      <label class="check"><input type="checkbox" data-shop="showTodaySales" ${s.showTodaySales ? 'checked' : ''}> Show today's sales on home screen</label>
    </section>
    <section class="card"><h2>Voice input <small>(this phone)</small></h2>
      <label class="lbl" for="sLang">LANGUAGE</label>
      <select id="sLang" class="input big" data-local="voiceLang">${Object.entries(VOICE_LANGS).map(([k, v]) => `<option value="${k}" ${k === local.get('voiceLang', 'en-IN') ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <p class="hint">${voice.supported ? '✅ Voice input works in this browser.' : '⚠ This browser has no voice input — the keyboard is used instead.'} Chrome's voice recognition usually needs internet.</p>
    </section>
    <section class="card"><h2>Weighing machine</h2>
      <p>Current: <b>${esc(scale.name)}</b></p>
      <p class="hint">Type the weight shown on the machine. Bluetooth scale support can be added in a later version.</p>
    </section>
    <section class="card"><h2>Backup</h2>
      <p>Last backup from this phone: <b>${last ? `${fmtDate(last)}, ${fmtTime(last)}` : 'Never'}</b></p>
      <p class="hint">Data is kept in the cloud and on each phone. An extra backup file once a month is still a good idea.</p>
      <button class="btn-mid" data-act="exportBackup">⬇ EXPORT BACKUP</button>
      <button class="btn-mid" data-act="importBackup">⬆ IMPORT BACKUP</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </section>
    <section class="card"><h2>Data</h2>
      <p>${counts}</p>
      <p class="hint" id="storageInfo"></p>
      <button class="btn-mid" data-act="loadSamples">Add sample products</button>
      <button class="btn-mid danger" data-act="deleteAllBills">🗑 DELETE ALL BILLS (keep products &amp; customers)</button>
      <button class="btn-mid danger" data-act="clearAll">🗑 CLEAR ALL DATA</button>
    </section>
    <p class="ver">A One Billing v${APP_VERSION}${cloud.emulator ? ' · EMULATOR' : ''}</p>
  </main>`;
}
async function fillStorageInfo() {
  const el = $('#storageInfo');
  if (!el) return;
  try {
    const persisted = await navigator.storage?.persisted?.();
    el.textContent = persisted ? '🔒 Offline copy on this phone is protected' : 'Install the app to protect the offline copy on this phone';
  } catch { /* not supported */ }
}

// ---------------------------------------------------------------- sheet & modal
let sheetCtx = null;
function openSheet(html) {
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
  w.hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet(fromRender = false) {
  const w = $('#sheet');
  if (w.hidden) return;
  w.hidden = true;
  w.innerHTML = '';
  sheetCtx = null;
  document.body.classList.remove('noscroll');
  if (!fromRender) setTimeout(flushRender, 60);
}
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// Resolves true (ok), false (cancel) or 'alt' (optional middle choice).
function confirmBox({ title, body = '', ok = 'YES', cancel = 'NO', alt = null, more = [], danger = false, typeToConfirm = null }) {
  return new Promise(resolve => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal" role="alertdialog"><h3>${title}</h3>${body ? `<p>${body}</p>` : ''}
      ${typeToConfirm ? `<input id="mConfirm" class="input big" placeholder="Type ${typeToConfirm}" autocomplete="off">` : ''}
      ${alt ? `<button class="btn-big go" data-m="1">${ok}</button>${more.map(([v, label]) => `<button class="btn-mid part" data-m="${v}">${label}</button>`).join('')}<button class="btn-mid due" data-m="alt">${alt}</button><button class="btn-mid" data-m="0">${cancel}</button>`
        : `<div class="btn-row"><button class="btn-mid" data-m="0">${cancel}</button><button class="btn-mid ${danger ? 'danger-fill' : 'go'}" data-m="1">${ok}</button></div>`}</div>`;
    m.hidden = false;
    m.onclick = e => {
      const b = e.target.closest('[data-m]');
      if (!b && e.target !== m) return;
      const yes = !b ? false : b.dataset.m === '1' ? true : b.dataset.m === '0' ? false : b.dataset.m;
      if (yes === true && typeToConfirm && $('#mConfirm').value.trim().toUpperCase() !== typeToConfirm) {
        toast(`Type ${typeToConfirm} to confirm`, 'err');
        return;
      }
      m.hidden = true;
      m.innerHTML = '';
      m.onclick = null;
      resolve(yes);
      setTimeout(flushRender, 60);
    };
  });
}

// --- quantity / weight entry
function openQtySheet(billId, productId, itemId = null, presetQty = null) {
  const bill = getBill(billId);
  const item = itemId ? bill.items.find(i => i.id === itemId) : null;
  const p = item ? null : getProduct(productId);
  if (!item && !p) return;
  const src = item
    ? { name: item.productName, category: item.category, unit: item.unit, priceType: item.priceType, rate: item.rate, allowDecimal: item.allowDecimal ?? UNITS[item.unit].decimal }
    : { name: p.name, category: p.category, unit: p.unit, priceType: p.priceType, rate: p.price, allowDecimal: p.allowDecimal };
  const sign = src.rate < 0 || (!src.rate && src.category === 'SCRAP') ? -1 : 1;
  const prod = p || getProduct(item.productId);
  const varP = !item && hasVariants(prod) ? prod : null;
  const varSel = {};
  const variant = varP ? settleVariant(varP, varSel) : null;
  if (varP) src.rate = variant ? variant.price : 0;
  sheetCtx = { billId, productId: item ? item.productId : p.id, itemId, addedAt: item?.addedAt, sign, askSize: asksSize(prod) || !!item?.size, size: item?.size || '', varSel: varP ? varSel : null, variant, ...src };
  if (variant) sheetCtx.sign = variant.price < 0 ? -1 : 1;
  const neg = sign < 0;
  const needRate = !src.rate && !varP;
  const per = PRICE_TYPES[src.priceType]?.per;
  const u = UNITS[src.unit].label;
  const startQty = item ? item.quantity : presetQty ?? (src.allowDecimal ? '' : '1');
  openSheet(`
    <div class="sheet-head ${neg ? 'neg' : ''}">
      <div><div class="sh-title">${esc(item ? itemTitle(item) : src.name)}${neg ? ' <span class="tag scrap">SCRAP</span>' : ''}</div>
      <div class="sh-sub">Rate: <b id="rateShow">${!src.rate ? '—' : rateText(src.rate, src.priceType)}</b>
        ${needRate ? '' : '<button type="button" class="link" data-act="toggleRate">change</button>'}</div></div>
      <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button>
    </div>
    <div id="rateBox" class="rate-box" ${needRate ? '' : 'hidden'}>
      <label class="lbl" for="rateIn">RATE ₹${per ? ' / ' + per : ''}${neg ? ' (deducted from bill)' : ''}</label>
      <input id="rateIn" class="input big" inputmode="decimal" autocomplete="off" value="${src.rate ? Math.abs(src.rate) : ''}" placeholder="0">
      <small class="hint">For this bill only — catalogue price stays the same.</small>
    </div>
    ${varP ? `<div id="varBox">${variantPicker(varP, varSel, 'pickVariant')}</div>` : ''}
    ${item ? `<label class="lbl" for="nameIn">NAME ON BILL</label><input id="nameIn" class="input big" autocomplete="off" value="${esc(item.productName)}">` : ''}
    ${sheetCtx.askSize ? sizePicker(prod, sheetCtx.size, 'pickSize', 'sizeIn') : ''}
    <label class="lbl" for="qtyIn">${qtyWord(src.unit)} (${u})</label>
    <div class="qty-row">
      ${src.allowDecimal ? '' : '<button type="button" class="step" data-act="step" data-d="-1">−</button>'}
      <input id="qtyIn" class="qty-input" inputmode="${src.allowDecimal ? 'decimal' : 'numeric'}" autocomplete="off" value="${startQty}" placeholder="0">
      ${src.allowDecimal ? `<span class="qty-unit">${u}</span>` : '<button type="button" class="step" data-act="step" data-d="1">＋</button>'}
    </div>
    ${scale.available && (src.unit === 'KG' || src.unit === 'GRAM') ? '<button type="button" class="btn-mid" data-act="readScale">⚖ Read from scale</button>' : ''}
    <div class="calc ${neg ? 'neg' : ''}" id="calcOut"></div>
    <button type="button" class="btn-big go" id="qtyGo" data-act="confirmQty">${item ? 'UPDATE' : 'ADD'}</button>
    ${item ? '<button type="button" class="btn-text danger" data-act="removeItem">Remove this item</button>' : ''}
  `);
  updateCalc();
  const f = needRate ? $('#rateIn') : $('#qtyIn');
  f.focus();
  f.select();
}
function currentRate() {
  const v = num($('#rateIn')?.value);
  return isNaN(v) ? 0 : sheetCtx.sign * Math.abs(v);
}
function updateCalc() {
  if (!sheetCtx) return;
  const q = num($('#qtyIn').value);
  const rate = currentRate();
  if (rate) $('#rateShow').textContent = rateText(rate, sheetCtx.priceType);
  const out = $('#calcOut');
  if (q > 0 && rate) {
    const amt = lineAmount(q, rate, sheetCtx.unit, sheetCtx.priceType);
    out.innerHTML = `${fmtQty(q, sheetCtx.unit)} ${unitLabel(sheetCtx.unit, q)} × ${money(rate)}<b>= ${money(amt)}</b>`;
  } else {
    out.innerHTML = `<span>${sheetCtx.varSel && !sheetCtx.variant ? 'Choose size / brand / material' : rate ? 'Enter ' + qtyWord(sheetCtx.unit).toLowerCase() : 'Enter rate'}</span><b>&nbsp;</b>`;
  }
  $('#qtyGo').disabled = !(q > 0 && rate);
}

// --- quick-add a product that isn't in the catalogue yet (while billing)
const QA_UNITS = [['PCS', 'pcs'], ['KG', 'kg'], ['GRAM', 'g'], ['METER', 'm'], ['BOX', 'box'], ['', 'Not sure']];
function openQuickAdd(billId, name = '') {
  sheetCtx = { kind: 'quick', billId, unit: '', priceMode: 'each' };
  openSheet(`
    <div class="sheet-head"><div><div class="sh-title">New product</div><div class="sh-sub">Only name and price needed. The rest can be filled in later.</div></div>
      <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button></div>
    <button type="button" class="btn-big speak" data-act="qaSpeak">🎤 SPEAK PRODUCT</button>
    <p class="hint" id="qaHeard">Say e.g. “thrust bearing 80 no. 365 rupees”</p>
    <label class="lbl" for="qaName">NAME</label>
    <input id="qaName" class="input big" autocomplete="off" placeholder="Product name" value="${esc(name)}">
    <div id="qaSimilar"></div>
    <div class="two">
      <div><label class="lbl" for="qaQty">QUANTITY</label><input id="qaQty" class="input big" inputmode="decimal" autocomplete="off" value="1"></div>
      <div><label class="lbl" for="qaPrice">PRICE ₹</label><input id="qaPrice" class="input big" inputmode="decimal" autocomplete="off" placeholder="0"></div>
    </div>
    <label class="lbl">UNIT</label>
    <div class="seg sign">${QA_UNITS.map(([u, l]) => `<button type="button" class="${u === '' ? 'on' : ''}" data-act="qaUnit" data-u="${u}">${l}</button>`).join('')}</div>
    <div class="seg sign">
      <button type="button" class="on" data-act="qaMode" data-m="each">Price per unit</button>
      <button type="button" data-act="qaMode" data-m="total">Total amount</button>
    </div>
    <label class="check"><input type="checkbox" id="qaScrap"> − Scrap / buy-back (deduct from bill)</label>
    <label class="check"><input type="checkbox" id="qaSave" checked> Save this price in the catalogue</label>
    <div class="calc" id="qaCalc"></div>
    <p class="hint warn" id="qaMissing"></p>
    <button type="button" class="btn-big go" id="qaGo" data-act="qaConfirm">ADD TO THIS BILL</button>`);
  updateQuick();
}
function readQuick() {
  const ctx = sheetCtx;
  const qty = num($('#qaQty').value) || 0;
  const price = num($('#qaPrice').value) || 0;
  const sign = $('#qaScrap').checked ? -1 : 1;
  const unit = ctx.unit || 'UNSET';
  const total = ctx.priceMode === 'total';
  const rate = total ? (qty ? round2(sign * price / qty) : 0) : sign * price;
  const amount = total ? sign * price : round2(sign * price * qty);
  return { name: $('#qaName').value.trim(), qty, price, unit, rate, amount, scrap: sign < 0, save: $('#qaSave').checked };
}
function updateQuick() {
  if (sheetCtx?.kind !== 'quick') return;
  const f = readQuick();
  const ok = f.qty > 0 && f.price > 0;
  $('#qaCalc').innerHTML = ok
    ? `${[fmtQty(f.qty, f.unit), unitLabel(f.unit, f.qty)].filter(Boolean).join(' ')} × ${money(f.rate)}<b class="${f.amount < 0 ? 'neg-text' : ''}">= ${money(f.amount)}</b>`
    : `<span>${f.price > 0 ? 'Enter quantity' : 'Enter price'}</span><b>&nbsp;</b>`;
  const missing = [f.unit === 'UNSET' && 'unit (pcs / kg…)', !f.save && 'catalogue price', !f.name && 'name'].filter(Boolean);
  $('#qaMissing').textContent = missing.length ? `⚠ Missing ${missing.join(', ')} — it will be flagged in Products so it can be completed later. Billing is not affected.` : '';
  $('#qaGo').disabled = !ok;
  // Already in the catalogue? Offer it instead of creating a duplicate.
  const similar = f.name.length >= 3 ? searchProducts(S.products.filter(p => p.active), f.name.split(' ')[0]).slice(0, 3) : [];
  $('#qaSimilar').innerHTML = similar.length ? `<p class="hint">Already in catalogue?</p><div class="chips wrap">${similar.map(p =>
    `<button type="button" class="pchip" data-act="qaUseExisting" data-id="${p.id}">${esc(p.name)} · ${p.price ? rateText(p.price, p.priceType) : 'no price'}</button>`).join('')}</div>` : '';
}
function fillQuick(text) {
  const r = parseProductSpeech(text);
  $('#qaHeard').innerHTML = `Heard: “${esc(text)}”`;
  if (r.name) $('#qaName').value = r.name;
  if (r.qty) $('#qaQty').value = r.qty;
  if (r.price) $('#qaPrice').value = r.price;
  if (r.unit) A.qaUnit($(`[data-act="qaUnit"][data-u="${r.unit}"]`));
  A.qaMode($(`[data-act="qaMode"][data-m="${r.priceMode}"]`));
  $('#qaScrap').checked = r.scrap;
  updateQuick();
}

// ---------------------------------------------------------------- actions
const A = {
  closeSheet: () => closeSheet(),
  back(el) { goBack(el.dataset.fb || '/'); },

  duesTab(el) {
    duesView.tab = el.dataset.t;
    local.set('duesTab', duesView.tab);
    render(true);
  },
  duesPeriod(el) {
    duesView.period = el.dataset.p;
    render(true);
  },
  setStart(el) {
    local.set('startPage', el.dataset.p);
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    toast('✓ Saved');
  },
  calcPick(el) {
    const p = getProduct(el.dataset.id);
    Object.assign(calc, { productId: p.id, varSel: {}, variant: null, qty: '' });
    calc.variant = hasVariants(p) ? settleVariant(p, calc.varSel) : null;
    calc.rate = String(Math.abs(calc.variant ? calc.variant.price : p.price) || '');
    saveCalc();
    render();
    $('#calcQty')?.focus();
  },
  calcVariant(el) {
    const p = getProduct(calc.productId);
    calc.variant = chooseVariant(p, calc.varSel, el.dataset.k, el.dataset.v);
    calc.rate = calc.variant ? String(Math.abs(calc.variant.price) || '') : '';
    saveCalc();
    $('#calcVarBox').innerHTML = variantPicker(p, calc.varSel, 'calcVariant');
    $('#calcRate').value = calc.rate;
    updateCalcPage();
  },
  calcClose() {
    calc.productId = null;
    saveCalc();
    render(true);
  },
  calcAdd() {
    const l = calcLine();
    if (!l || !(l.qty > 0) || !l.rate) return toast('Enter the amount and rate', 'err');
    calc.lines.push({ productId: l.p.id, name: l.p.name, label: l.label, variant: calc.variant ? variantLabel(calc.variant) : '', variantId: calc.variant?.id || null,
      category: l.p.category, unit: l.p.unit, priceType: l.p.priceType, qty: l.qty, rate: l.rate, amount: l.amount });
    calc.qty = '';
    saveCalc();
    toast(`✓ ${l.label}  ${money(l.amount)}`);
    render(true);
    $('#calcQty')?.focus();
  },
  calcDel(el) {
    calc.lines.splice(Number(el.dataset.i), 1);
    saveCalc();
    render(true);
  },
  async calcClear() {
    if (!await confirmBox({ title: 'Clear this estimate?', ok: 'CLEAR', danger: true })) return;
    calc.lines = [];
    saveCalc();
    render(true);
  },
  calcShare() { shareText('Estimate', calcText()); },
  calcToBill() {
    const bill = createBill();
    const at = now();
    for (const l of calc.lines) {
      putBillItem(bill, {
        id: uid(), billId: bill.id, productId: l.productId, productName: l.name, category: l.category, unit: l.unit, priceType: l.priceType,
        allowDecimal: true, quantity: l.qty, rate: l.rate, amount: l.amount, isNegative: l.amount < 0, addedAt: at, addedBy: S.user.email,
        ...(l.variant ? { variant: l.variant, variantId: l.variantId } : {}),
      }, { status: 'ACTIVE' });
    }
    calc.lines = [];
    saveCalc();
    toast('✓ Bill made — choose the customer');
    go(`/bill/${bill.id}/customer`);
  },
  setLang(el) {
    if (local.get('lang', 'en') === el.dataset.l) return;
    local.set('lang', el.dataset.l);
    location.reload();
  },

  // --- account
  async signIn() {
    try {
      await cloud.signIn();
    } catch (e) {
      const msg = {
        'auth/unauthorized-domain': 'This website is not allowed yet: add it in Firebase → Authentication → Settings → Authorized domains',
        'auth/network-request-failed': 'No internet — connect once to sign in',
        'auth/popup-closed-by-user': '',
        'auth/cancelled-popup-request': '',
      }[e.code];
      if (msg !== '') toast(msg || 'Sign-in failed: ' + (e.code || e.message), 'err');
    }
  },
  async emuSignIn() {
    await cloud.emuSignIn($('#emuEmail').value.trim());
  },
  async signOut() {
    if (S.user && !S.denied && !await confirmBox({ title: 'Sign out?', body: 'You will need internet to sign in again.', ok: 'SIGN OUT' })) return;
    await cloud.signOut();
  },

  newBill() {
    const b = createBill();
    go(`/bill/${b.id}/customer`);
  },
  openBill(el) {
    const b = getBill(el.dataset.id);
    if (b) go(!isOpenBill(b) ? `/receipt/${b.id}` : b.customerChosen ? `/bill/${b.id}` : `/bill/${b.id}/customer`);
  },
  openReceipt(el) { go(`/receipt/${el.dataset.id}`); },
  changeCustomer() { go(`/bill/${R.b}/customer`); },

  async mic(el) {
    const input = document.getElementById(el.dataset.target);
    if (!voice.supported) {
      toast(voice.errorMessage('unsupported'));
      input.focus();
      return;
    }
    if (el.classList.contains('listening')) return voice.stop();
    el.classList.add('listening');
    toast('🎤 Listening… say the name');
    try {
      input.value = await voice.listen(local.get('voiceLang', 'en-IN'));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      $('#toast').hidden = true;
    } catch (err) {
      toast(voice.errorMessage(err), 'err');
      input.focus();
    } finally {
      el.classList.remove('listening');
    }
  },

  // --- customer for bill
  pickCustomer(el) {
    const c = getCustomer(el.dataset.id);
    setBillCustomer({ id: c.id, name: c.name, phone: c.phone, type: 'REGULAR' });
  },
  useTypedName() {
    setBillCustomer({ id: null, name: $('#custSearch').value.trim(), phone: '', type: 'ONE_OFF' });
  },
  saveTypedName() {
    const c = saveCustomer({ name: $('#custSearch').value.trim() });
    setBillCustomer({ id: c.id, name: c.name, phone: '', type: 'REGULAR' });
  },
  oneOff() {
    const pre = $('#custSearch')?.value.trim() || '';
    openSheet(`
      <div class="sheet-head"><div><div class="sh-title">One-off customer</div><div class="sh-sub">Name and phone are optional</div></div>
        <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button></div>
      <label class="lbl" for="ooName">NAME</label>
      <div class="search-row"><input id="ooName" class="input big" placeholder="Walk-in customer" autocomplete="off" value="${esc(pre)}">${micBtn('ooName')}</div>
      <label class="lbl" for="ooPhone">PHONE</label>
      <input id="ooPhone" class="input big" type="tel" inputmode="tel" autocomplete="off">
      <label class="check"><input type="checkbox" id="ooSave"> Also save as regular customer</label>
      <button type="button" class="btn-big go" data-act="confirmOneOff">CONTINUE ›</button>`);
    $('#ooName').focus();
  },
  confirmOneOff() {
    const name = $('#ooName').value.trim();
    const phone = $('#ooPhone').value.trim();
    if ($('#ooSave').checked && name) {
      const c = saveCustomer({ name, phone });
      return setBillCustomer({ id: c.id, name, phone, type: 'REGULAR' });
    }
    setBillCustomer({ id: null, name, phone, type: 'ONE_OFF' });
  },

  // --- wire bundles
  bnPickCustomer(el) {
    const c = getCustomer(el.dataset.id);
    Object.assign(bnDraft, { customerId: c.id, customerName: c.name, customerPhone: c.phone || '' });
    render(true);
  },
  bundleInBill() { openBundleSheet(R.b); },
  pickVariant(el) {
    const ctx = sheetCtx;
    const p = getProduct(ctx.productId);
    ctx.variant = chooseVariant(p, ctx.varSel, el.dataset.k, el.dataset.v);
    $('#varBox').innerHTML = variantPicker(p, ctx.varSel, 'pickVariant');
    if (ctx.variant) {
      ctx.sign = ctx.variant.price < 0 ? -1 : 1;
      $('#rateIn').value = Math.abs(ctx.variant.price) || '';
      $('#rateShow').textContent = rateText(ctx.variant.price, ctx.priceType);
      $('.sh-title').firstChild.textContent = withSize(ctx.name, variantLabel(ctx.variant));
    } else {
      $('#rateIn').value = '';
      $('#rateShow').textContent = '—';
      $('.sh-title').firstChild.textContent = ctx.name;
    }
    updateCalc();
  },
  addVarRow() { $('#varRows').insertAdjacentHTML('beforeend', varRowHtml({})); },
  copyVarRow(el) {
    const row = el.closest('.var-row');
    const v = Object.fromEntries([...row.querySelectorAll('[data-f]')].map(i => [i.dataset.f, i.value]));
    row.insertAdjacentHTML('afterend', varRowHtml({ ...v, price: num(v.price) || 0 }));
  },
  delVarRow(el) {
    const row = el.closest('.var-row');
    if ($('#varRows').children.length > 1) row.remove();
    else row.querySelectorAll('input').forEach(i => (i.value = ''));
  },
  pickSize(el) {
    sheetCtx.size = el.dataset.s;
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    $('#sizeIn').value = '';
  },
  bnVariant(el) {
    const p = getProduct(bnDraft.productId);
    bnDraft.variant = chooseVariant(p, bnDraft.varSel, el.dataset.k, el.dataset.v);
    refreshBundleForm();
  },
  bnSize(el) {
    bnDraft.size = el.dataset.s;
    refreshBundleForm();
  },
  bnTypedCustomer() {
    Object.assign(bnDraft, { customerId: null, customerName: $('#bnCust').value.trim(), customerPhone: '' });
    render(true);
  },
  bnClearCustomer() {
    Object.assign(bnDraft, { customerId: null, customerName: '', customerPhone: '' });
    render(true);
  },
  bnPickProduct(el) {
    const p = getProduct(el.dataset.id);
    if (bnDraft.productId !== p.id) {
      bnDraft.size = '';
      bnDraft.varSel = {};
      bnDraft.variant = hasVariants(p) ? settleVariant(p, bnDraft.varSel) : null;
    }
    bnDraft.productId = p.id;
    bnDraft.box = p.boxWeight != null ? String(p.boxWeight) : bnDraft.box || '0.300';
    refreshBundleForm();
  },
  bnPacking(el) {
    bnDraft.packing = el.dataset.p;
    refreshBundleForm();
  },
  bnGive() {
    const d = bnDraft;
    const p = getProduct(d.productId);
    const out = round3(num(d.out) || 0);
    const box = d.packing === 'BS' ? round3(num(d.box) || 0) : 0;
    if (!d.customerName || !p || !(out > 0) || box >= out) return toast('Check customer, wire and weight', 'err');
    if (asksSize(p) && !d.size) return toast('Choose wire size', 'err');
    if (hasVariants(p) && !d.variant) return toast('Choose size / brand / material', 'err');
    const inBill = !!d.billId;
    const bill = inBill ? getBill(d.billId) : openBillFor(d);
    if (!bill || !['ACTIVE', 'DRAFT'].includes(bill.status)) return toast('This bill was closed on another phone', 'err');
    giveBundle(d, bill);
    bnDraft = null;
    toast(`✓ Bundle given: ${kg(out)} kg`);
    if (inBill) {
      closeSheet(true);
      render(true);
    } else go(`/bill/${bill.id}`, true);
  },
  brMode(el) {
    bnReturn.mode = el.dataset.m;
    render(true);
  },
  brConfirm() {
    const f = readReturn();
    const bd = f.bd;
    if (bd.status !== 'OUT') return toast('This bundle was already returned', 'err');
    if (f.used < 0 || (f.used > 0 && !(f.rate > 0))) return toast('Check the weight and rate', 'err');
    const at = now();
    // Fill in the bundle's own line on its bill — open or already completed.
    // Only if that bill was cancelled/deleted does it go on the customer's open bill.
    let bill = getBill(bd.billId);
    const own = bill?.items.find(i => i.id === bd.itemId);
    const sameBill = !!own && bill.status !== 'CANCELLED';
    if (!sameBill) bill = openBillFor(bd);
    const p = getProduct(bd.productId);
    const item = {
      ...(sameBill ? own : {}), id: sameBill ? own.id : uid(), billId: bill.id, productId: bd.productId, productName: bd.productName,
      category: p?.category || 'WEIGHT', unit: 'KG', priceType: 'PER_KG', allowDecimal: true, quantity: f.used, rate: f.rate,
      amount: f.amount, isNegative: false, pending: false, note: f.note, bundleId: bd.id, size: bd.size || '', variant: bd.variant || '', addedAt: sameBill ? own.addedAt : at, addedBy: S.user.email,
    };
    putBillItem(bill, item, bill.status === 'DRAFT' ? { status: 'ACTIVE' } : {});
    if (bill.status === 'COMPLETED') {
      stockMove(item, 1);
      cloud.update('bills', bill.id, payStateOf(bill));
    }
    const closed = {
      status: 'RETURNED', returnWeight: f.back, returnedWithBox: bnReturn.withBox, usedKg: f.used, rate: f.rate, amount: f.amount,
      returnNote: f.note, returnAt: at, returnBy: S.user.email, billId: bill.id, itemId: item.id, updatedAt: at,
    };
    Object.assign(bd, closed);
    cloud.update('bundles', bd.id, closed);
    bnReturn = null;
    toast(f.used ? `✓ ${kg(f.used)} kg added to bill  ${money(f.amount)}` : 'Bundle closed — nothing used');
    go(billHref(bill), true);
  },
  brUndo() {
    const bd = getBundle(R.b);
    const bill = getBill(bd.billId);
    const it = bill?.items.find(i => i.id === bd.itemId);
    if (!it || bill.status === 'CANCELLED') return toast('This bill was cancelled', 'err');
    if (bill.status === 'COMPLETED') stockMove(it, -1);
    putBillItem(bill, { ...it, quantity: 0, amount: 0, pending: true, note: `${bundleGiven(bd)} · ${PENDING}` });
    if (bill.status === 'COMPLETED') cloud.update('bills', bill.id, payStateOf(bill));
    const reset = { status: 'OUT', returnAt: null, returnNote: null, usedKg: null, amount: null, updatedAt: now() };
    Object.assign(bd, reset);
    cloud.update('bundles', bd.id, reset);
    bnReturn = null;
    render(true);
  },
  async brDelete() {
    const bd = getBundle(bnReturn.id);
    if (!await confirmBox({ title: 'Delete this bundle entry?', body: `${esc(bd.customerName)} · ${esc(bd.productName)} ${kg(bd.outWeight)} kg. Use this only if it was entered by mistake.`, ok: 'DELETE', danger: true })) return;
    S.bundles = S.bundles.filter(b => b.id !== bd.id);
    cloud.remove('bundles', bd.id);
    const bill = getBill(bd.billId);
    if (bill && ['ACTIVE', 'DRAFT'].includes(bill.status) && bill.items.some(i => i.id === bd.itemId)) dropBillItem(bill, bd.itemId);
    bnReturn = null;
    toast('Bundle entry deleted');
    goBack('/bundles');
  },

  // --- quick-add new product while billing
  quickAdd(el) { openQuickAdd(R.b, el?.dataset.name || $('#prodSearch')?.value.trim() || ''); },
  quickAddVoice() {
    openQuickAdd(R.b);
    A.qaSpeak($('[data-act="qaSpeak"]'));
  },
  async qaSpeak(el) {
    if (!voice.supported) {
      toast(voice.errorMessage('unsupported'));
      return $('#qaName').focus();
    }
    if (el.classList.contains('listening')) return voice.stop();
    el.classList.add('listening');
    el.textContent = '🎤 Listening… speak now';
    try {
      fillQuick(await voice.listen(local.get('voiceLang', 'en-IN')));
    } catch (err) {
      toast(voice.errorMessage(err).replace('the name', 'the details'), 'err');
    } finally {
      el.classList.remove('listening');
      el.textContent = '🎤 SPEAK AGAIN';
    }
  },
  qaUnit(el) {
    sheetCtx.unit = el.dataset.u;
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    updateQuick();
  },
  qaMode(el) {
    sheetCtx.priceMode = el.dataset.m;
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    updateQuick();
  },
  qaUseExisting(el) {
    const { billId } = sheetCtx;
    const qty = num($('#qaQty').value) || null;
    closeSheet(true);
    openQtySheet(billId, el.dataset.id, null, qty);
  },
  qaConfirm() {
    const ctx = sheetCtx;
    const f = readQuick();
    if (!(f.qty > 0 && f.price > 0)) return toast('Enter quantity and price', 'err');
    const bill = getBill(ctx.billId);
    if (!bill) return toast('This bill was closed on another phone', 'err');
    const name = f.name || 'New item';
    const category = f.scrap ? 'SCRAP' : ['KG', 'GRAM'].includes(f.unit) ? 'WEIGHT' : ['PCS', 'BOX'].includes(f.unit) ? 'PIECE' : 'OTHER';
    const priceType = UNIT_PRICE_TYPE[f.unit];
    const allowDecimal = f.unit === 'UNSET' || UNITS[f.unit].decimal;
    // Same name already in the catalogue → reuse it rather than making a duplicate.
    let p = S.products.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (p) {
      if (f.save && !p.price) {
        p.price = f.rate;
        cloud.update('products', p.id, { price: f.rate, isNegative: f.rate < 0, updatedAt: now() });
      }
    } else {
      p = makeProduct({ name, category, unit: f.unit, priceType, price: f.save ? f.rate : 0, allowDecimal });
      Object.assign(p, { needsReview: true, addedBy: S.user.email, addedFrom: 'billing' });
      S.products.push(p);
      cloud.put('products', p);
    }
    putBillItem(bill, {
      id: uid(), billId: bill.id, productId: p.id, productName: p.name, category: p.category,
      unit: p.unit, priceType: p.priceType, allowDecimal: p.allowDecimal,
      quantity: f.qty, rate: f.rate, amount: f.amount, isNegative: f.amount < 0, addedAt: now(), addedBy: S.user.email,
    }, bill.status === 'DRAFT' ? { status: 'ACTIVE' } : {});
    toast(`✓ Added ${p.name}  ${money(f.amount)}${isIncomplete(p) ? ' · flagged to complete later' : ''}`);
    render(true);
  },
  toggleReview() {
    reviewOnly = !reviewOnly;
    render(true);
  },

  // --- items
  pickProduct(el) { openQtySheet(R.b, el.dataset.id); },
  editItem(el) {
    const it = getBill(R.b)?.items.find(i => i.id === el.dataset.id);
    if (it?.bundleId && getBundle(it.bundleId)) return go(`/bundle/${it.bundleId}/${R.b}`);
    openQtySheet(R.b, null, el.dataset.id);
  },
  toggleRate() {
    $('#rateBox').hidden = false;
    $('#rateIn').focus();
    $('#rateIn').select();
  },
  step(el) {
    const i = $('#qtyIn');
    i.value = Math.max(1, (num(i.value) || 0) + Number(el.dataset.d));
    updateCalc();
  },
  async readScale() {
    try {
      $('#qtyIn').value = round3(await scale.read());
      updateCalc();
    } catch (e) {
      toast(e.message, 'err');
    }
  },
  confirmQty() {
    const ctx = sheetCtx;
    if (!ctx) return;
    const q = num($('#qtyIn').value);
    const rate = currentRate();
    if (!rate) {
      $('#rateBox').hidden = false;
      $('#rateIn').focus();
      return toast('Enter the rate', 'err');
    }
    if (!(q > 0)) {
      $('#qtyIn').focus();
      return toast(`Enter ${qtyWord(ctx.unit).toLowerCase()}`, 'err');
    }
    if (!ctx.allowDecimal && !Number.isInteger(q)) return toast(`Whole numbers only for ${ctx.name}`, 'err');
    if (ctx.askSize && !ctx.size) return toast('Choose wire size', 'err');
    if (ctx.varSel && !ctx.variant) return toast('Choose size / brand / material', 'err');
    if (ctx.itemId && $('#nameIn')?.value.trim()) ctx.name = $('#nameIn').value.trim();
    const bill = getBill(ctx.billId);
    if (!bill) return toast('This bill was closed on another phone', 'err');
    const amount = lineAmount(q, rate, ctx.unit, ctx.priceType);
    const item = {
      id: ctx.itemId || uid(), billId: bill.id, productId: ctx.productId, productName: ctx.name, category: ctx.category,
      unit: ctx.unit, priceType: ctx.priceType, allowDecimal: ctx.allowDecimal,
      quantity: q, rate, amount, isNegative: rate < 0, addedAt: ctx.addedAt || now(), addedBy: S.user.email,
      ...(ctx.size ? { size: ctx.size } : {}),
      ...(ctx.variant ? { variantId: ctx.variant.id, variant: variantLabel(ctx.variant) } : {}),
      ...(ctx.itemId ? (({ variant = '', variantId = null }) => ({ variant, variantId }))(getBill(ctx.billId).items.find(i => i.id === ctx.itemId) || {}) : {}),
    };
    putBillItem(bill, item, bill.status === 'DRAFT' ? { status: 'ACTIVE' } : {});
    rememberSize(getProduct(ctx.productId), ctx.size);
    toast(`${ctx.itemId ? 'Updated' : '✓ Added'} ${itemTitle(item)}  ${money(amount)}`);
    render(true);
  },
  async removeItem() {
    const ctx = sheetCtx;
    const bill = getBill(ctx.billId);
    const it = bill.items.find(i => i.id === ctx.itemId);
    if (!await confirmBox({ title: `Remove ${esc(itemTitle(it))}?`, body: `${lineCalcText(it)} = ${money(it.amount)}`, ok: 'REMOVE', danger: true })) return;
    dropBillItem(getBill(ctx.billId), it.id);
    toast('Item removed');
    render(true);
  },

  // --- bill actions
  saveBill() {
    const bill = getBill(R.b);
    updateBill(bill, { status: 'ACTIVE' });
    toast('✓ Bill saved');
    go('/');
  },
  async completeBill() {
    let bill = getBill(R.b);
    if (!bill.items.length) return toast('Add at least one item first', 'err');
    const out = bill.total < 0;
    const amt = (out ? `Pay to customer <b>${money(Math.abs(bill.total))}</b>` : `Total <b>${money(bill.total)}</b>`)
      + (bill.payments?.length ? `<br>Paid earlier <b>${money(bill.paid)}</b> · Balance <b>${money(bill.balance)}</b>` : '');
    const choice = await confirmBox({
      title: `Complete bill for ${esc(billName(bill))}?`,
      body: `${plural(bill.items.length, 'item')} · ${amt}${bill.items.some(i => i.pending) ? `<br><span class="warn-text">⏳ ${plural(bill.items.filter(i => i.pending).length, 'wire bundle')} not returned yet — the bill stays open and the wire used is added to it when returned.</span>` : ''}`,
      ok: out ? '✓ PAID OUT' : '✓ PAID', alt: out ? 'PAY LATER' : 'PAY LATER (DUE)', cancel: 'BACK',
      more: out ? [] : [['part', 'PART PAID — choose items']],
    });
    if (!choice) return;
    bill = getBill(bill.id); // may have changed on the other phone meanwhile
    if (!bill || bill.status !== 'ACTIVE' && bill.status !== 'DRAFT') return toast('This bill was already closed on another phone', 'err');
    const at = now();
    // An edited bill keeps its original date.
    updateBill(bill, { status: 'COMPLETED', completedAt: bill.completedAt || at, completedBy: S.user.email, ...(bill.completedAt ? { editedAt: at } : {}) });
    const paidIds = paidItemIds(bill);
    const unpaid = bill.items.filter(i => !i.pending && i.amount && !paidIds.has(i.id)).map(i => i.id);
    const byItem = bill.wireOut || bill.payments.some(p => p.itemIds);
    if (choice === true && Math.abs(bill.balance) >= 0.005) addPayment(bill, bill.balance, 'Cash', byItem ? unpaid : null);
    else cloud.update('bills', bill.id, payStateOf(bill));
    adjustStock(bill);
    if (bill.customerId && getCustomer(bill.customerId)) cloud.update('customers', bill.customerId, { lastBilledAt: at });
    toast('✓ Bill completed');
    if (choice === 'part') payAfterRender = bill.id;
    go(`/done/${bill.id}`, true);
  },
  async cancelBill() {
    const bill = getBill(R.b);
    if (!await confirmBox({ title: `Cancel bill for ${esc(billName(bill))}?`, body: bill.items.length ? `${plural(bill.items.length, 'item')} · ${money(bill.total)} will be cancelled.` : '', ok: 'CANCEL BILL', cancel: 'KEEP', danger: true })) return;
    const b = getBill(bill.id);
    if (b) {
      if (b.items.length) updateBill(b, { status: 'CANCELLED', cancelledBy: S.user.email });
      else deleteBill(b);
      b.items.filter(it => it.bundleId).forEach(it => detachBundle(it.bundleId));
    }
    toast('Bill cancelled');
    go('/', true);
  },
  async editBill(el) {
    const bill = getBill(el.dataset.id);
    if (!await confirmBox({
      title: `Edit bill ${billLabel(bill)}?`,
      body: 'The bill opens again: change the customer, add items, change quantities or rates. Payments already received are kept. Tap COMPLETE again when done.',
      ok: '✎ EDIT',
    })) return;
    const b = getBill(bill.id);
    if (b.status !== 'COMPLETED') return toast('This bill is already open', 'err');
    b.items.forEach(it => stockMove(it, -1)); // put back; completing again takes it out
    updateBill(b, { status: 'ACTIVE', reopenedAt: now(), reopenedBy: S.user.email });
    go(`/bill/${b.id}`);
  },
  async deleteBillDoc(el) {
    const bill = getBill(el.dataset.id);
    const linked = S.bundles.filter(bd => bd.billId === bill.id);
    if (!await confirmBox({
      title: `Delete bill ${billLabel(bill)}?`,
      body: `${esc(billName(bill))} · ${money(bill.total)}. It disappears from history, reports and dues on every phone${linked.length ? `, together with its ${plural(linked.length, 'wire bundle')}` : ''}. This can't be undone.`,
      ok: 'DELETE', danger: true,
    })) return;
    if (bill.status === 'COMPLETED') bill.items.forEach(it => stockMove(it, -1));
    linked.forEach(bd => cloud.remove('bundles', bd.id));
    S.bundles = S.bundles.filter(bd => bd.billId !== bill.id);
    S.olderBills = S.olderBills.filter(b => b.id !== bill.id);
    deleteBill(bill);
    toast('Bill deleted');
    goBack('/history');
  },
  async deleteAllBills() {
    if (!navigator.onLine) return toast('Connect to the internet first', 'err');
    if (!await confirmBox({ title: 'Delete ALL bills?', body: 'All bills, payments, dues and wire bundles are erased <b>on every phone</b>. Products, customers and shop settings are kept. Bill numbers start again from 1.', ok: 'DELETE BILLS', danger: true, typeToConfirm: 'DELETE' })) return;
    try {
      toast('Deleting…');
      await cloud.deleteAll(['bills', 'bundles']);
      cloud.remove('meta', 'counters');
      cloud.setMeta('shop', { countersResetAt: now() });
      S.olderBills = [];
      toast('✓ All bills deleted');
      go('/', true);
    } catch (e) {
      toast('Could not delete: ' + e.message, 'err');
    }
  },
  shareBill(el) {
    const bill = getBill(el.dataset.id);
    shareText(`Bill ${billLabel(bill)}`, receiptText(bill));
  },
  // iPhone home-screen apps ignore window.print(), and some Android setups do
  // too. There the bill goes out as an image through the share menu, which
  // offers Print (and WhatsApp, Save image…). Elsewhere the normal print dialog
  // opens; if it doesn't start within a moment, the image route is used.
  printBill(el) {
    const bill = getBill(el.dataset.id);
    if (IS_IOS || typeof window.print !== 'function') return shareBillImage(bill, true);
    let started = false;
    const mark = () => (started = true);
    window.addEventListener('beforeprint', mark, { once: true });
    window.print();
    setTimeout(() => {
      window.removeEventListener('beforeprint', mark);
      if (!started) shareBillImage(bill, true);
    }, 700);
  },

  // --- reports & payments
  setPeriod(el) {
    rep.period = el.dataset.p;
    if (rep.period === 'custom' && !rep.from) {
      rep.from = dayKey(addDays(new Date(), -6));
      rep.to = dayKey(new Date());
    }
    render(true);
  },
  setTab(el) {
    rep.tab = el.dataset.t;
    if (R.a !== 'reports' || R.b) return go('/reports');
    render(true);
  },
  shareReport() { shareText('Sales report', reportText()); },
  stlMode(el) {
    stl.mode = el.dataset.p;
    if (stl.mode === 'custom' && !stl.from) {
      stl.from = dayKey(addDays(new Date(), -6));
      stl.to = dayKey(new Date());
    }
    render(true);
  },
  shareSettlement(el) {
    const { ops, name } = settlementOps(el.dataset.key);
    shareText(`Settlement — ${name}`, docText(ops));
  },
  printSettlement(el) {
    const key = el.dataset.key;
    printOrShare(() => docCanvas(settlementOps(key).ops), `settlement-${settlementOps(key).name.replace(/\W+/g, '-')}.png`, 'Settlement bill');
  },
  shareStatement(el) { shareText('Statement', statementText(el.dataset.key)); },
  payBill(el) {
    const b = getBill(el.dataset.id);
    openPaySheet({ mode: 'bill', billId: b.id, name: `${billName(b)} · ${billLabel(b)}`, balance: b.balance });
  },
  payCustomer(el) {
    const g = duesByCustomer().find(x => x.key === el.dataset.key);
    if (!g || g.balance <= 0) return toast('Nothing due', 'err');
    openPaySheet({ mode: 'customer', key: g.key, name: g.name, balance: g.balance });
  },
  setMethod(el) {
    sheetCtx.method = el.dataset.m;
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
  },
  savePayment() {
    const ctx = sheetCtx;
    if (!ctx) return;
    const amt = num($('#payIn').value);
    if (!(amt > 0) || amt > Math.abs(ctx.balance) + 0.005) return toast('Check the amount', 'err');
    if (ctx.mode === 'bill') {
      const b = getBill(ctx.billId);
      const ids = [...document.querySelectorAll('.payItem:checked')].map(x => x.value);
      addPayment(b, Math.sign(b.balance) * amt, ctx.method, ids);
    } else {
      // Oldest unpaid bills first.
      let left = amt;
      for (const b of unpaidBills().filter(x => custKey(x) === ctx.key && x.balance > 0)) {
        if (left <= 0.005) break;
        const take = round2(Math.min(left, b.balance));
        addPayment(b, take, ctx.method);
        left = round2(left - take);
      }
    }
    toast(`✓ ${money(amt)} ${ctx.balance < 0 ? 'paid to' : 'received from'} ${ctx.name.split(' · ')[0]}`);
    render(true);
  },
  async deletePayment(el) {
    const b = getBill(el.dataset.bill);
    const p = b.payments.find(x => x.id === el.dataset.id);
    if (!await confirmBox({ title: 'Delete this payment?', body: `${money(Math.abs(p.amount))} on ${fmtDate(p.at)}. The bill will show as due again.`, ok: 'DELETE', danger: true })) return;
    removePayment(getBill(b.id), p.id);
    toast('Payment deleted');
    render(true);
  },
  async loadOlder(el) {
    if (!navigator.onLine) return toast('Needs internet to load older bills', 'err');
    el.disabled = true;
    el.textContent = 'Loading…';
    try {
      const dates = allBills().map(b => b.updatedAt).sort();
      const before = S.olderBills.length ? dates[0] : recentCutoff();
      const rows = await cloud.loadBillsBefore(before);
      S.olderBills.push(...rows.map(billFromDoc));
      toast(rows.length ? `Loaded ${plural(rows.length, 'older bill')}` : 'No older bills');
      render(true);
    } catch (e) {
      toast('Could not load: ' + e.message, 'err');
      el.disabled = false;
    }
  },

  // --- customers
  billForCustomer(el) {
    const c = getCustomer(el.dataset.id);
    const b = createBill({ customerChosen: true, customerId: c.id, customerName: c.name, customerPhone: c.phone || '', customerType: 'REGULAR' });
    go(`/bill/${b.id}/add`);
  },
  async deleteCustomer(el) {
    const c = getCustomer(el.dataset.id);
    if (!await confirmBox({ title: `Delete ${esc(c.name)}?`, body: 'Removed from both phones. Old bills keep the name.', ok: 'DELETE', danger: true })) return;
    S.customers = S.customers.filter(x => x.id !== c.id);
    cloud.remove('customers', c.id);
    toast('Customer deleted');
    go('/customers', true);
  },

  // --- products
  toggleFav(el) {
    const p = getProduct(el.dataset.id);
    p.favourite = !p.favourite;
    cloud.update('products', p.id, { favourite: p.favourite, updatedAt: now() });
    el.classList.toggle('on', p.favourite);
    toast(p.favourite ? `⭐ ${p.name} added to quick items` : `${p.name} removed from quick items`);
  },
  editPrice(el) {
    const p = getProduct(el.dataset.id);
    if (hasVariants(p)) return go(`/product/${p.id}`);
    const sign = p.price < 0 || (!p.price && p.category === 'SCRAP') ? -1 : 1;
    sheetCtx = { productId: p.id, sign };
    const per = PRICE_TYPES[p.priceType]?.per;
    openSheet(`
      <div class="sheet-head"><div><div class="sh-title">${esc(p.name)}</div><div class="sh-sub">Current: <b class="${p.price < 0 ? 'neg-text' : ''}">${p.price ? rateText(p.price, p.priceType) : 'entered at billing'}</b></div></div>
        <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button></div>
      <div class="seg sign">
        <button type="button" class="${sign > 0 ? 'on' : ''}" data-act="setSign" data-s="1">＋ Sell</button>
        <button type="button" class="negb ${sign < 0 ? 'on' : ''}" data-act="setSign" data-s="-1">− Scrap / buy-back</button>
      </div>
      <label class="lbl" for="priceIn">NEW PRICE ₹${per ? ' / ' + per : ''}</label>
      <input id="priceIn" class="qty-input" inputmode="decimal" autocomplete="off" value="${p.price ? Math.abs(p.price) : ''}">
      <p class="hint">Updates on both phones. Applies to items added from now on — existing bills keep their price.</p>
      <button type="button" class="btn-big go" data-act="savePrice">SAVE PRICE</button>`);
    $('#priceIn').focus();
    $('#priceIn').select();
  },
  setSign(el) {
    sheetCtx.sign = Number(el.dataset.s);
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
  },
  savePrice() {
    const p = getProduct(sheetCtx.productId);
    const v = num($('#priceIn').value);
    if (isNaN(v) || v < 0) return toast('Enter a valid price', 'err');
    const old = p.price;
    p.price = sheetCtx.sign * v;
    p.isNegative = p.price < 0;
    cloud.update('products', p.id, { price: p.price, isNegative: p.isNegative, updatedAt: now() });
    toast(`✓ ${p.name}: ${money(old)} → ${money(p.price)}`);
    render(true);
  },
  async deleteProduct(el) {
    const p = getProduct(el.dataset.id);
    if (!await confirmBox({ title: `Delete ${esc(p.name)}?`, body: 'Removed from both phones. Old bills are not affected. Tip: you can mark it Inactive instead.', ok: 'DELETE', danger: true })) return;
    S.products = S.products.filter(x => x.id !== p.id);
    cloud.remove('products', p.id);
    toast('Product deleted');
    go('/products', true);
  },
  loadSamples() {
    const have = new Set(S.products.map(p => p.name.toLowerCase()));
    const add = SAMPLE_PRODUCTS.filter(r => !have.has(r[0].toLowerCase())).map(sampleToProduct);
    if (!add.length) return toast('Sample products already present');
    S.products.push(...add);
    add.forEach(p => cloud.put('products', p));
    toast(`Added ${plural(add.length, 'product')}`);
    render(true);
  },

  // --- migration of pre-sync data on this phone
  dismissMigrate() {
    local.set('migrated', true);
    render(true);
  },
  async migrate(el) {
    if (!navigator.onLine) return toast('Connect to the internet to upload', 'err');
    const L = S.legacy;
    const names = new Set(S.products.map(p => p.name.toLowerCase()));
    const people = new Set(S.customers.map(c => `${c.name.toLowerCase()}|${c.phone || ''}`));
    const dev = deviceCode();
    const shop = Object.fromEntries((L.settings || []).filter(r => r.key in DEFAULT_SHOP).map(r => [r.key, r.value]));
    const data = {
      products: L.products.filter(p => !names.has(p.name.toLowerCase())),
      customers: L.customers.filter(c => !people.has(`${c.name.toLowerCase()}|${c.phone || ''}`)),
      bills: L.bills.filter(b => b.items?.length).map(b => billToDoc({ ...b, device: b.device || dev, createdBy: b.createdBy || S.user.email })),
      meta: S.loaded.meta && S.shop.shopName === DEFAULT_SHOP.shopName && Object.keys(shop).length ? [{ id: 'shop', ...shop }] : [],
    };
    const maxNo = Math.max(0, ...data.bills.filter(b => b.device === dev).map(b => b.billNo));
    el.disabled = true;
    el.textContent = 'Uploading…';
    try {
      await cloud.writeAll(data);
      if (maxNo) {
        local.set('counter.' + dev, Math.max(local.get('counter.' + dev, 0), maxNo));
        cloud.setMeta('counters', { [dev]: Math.max(S.counters[dev] || 0, maxNo) });
      }
      local.set('migrated', true);
      toast(`✓ Uploaded ${plural(data.products.length, 'product')}, ${plural(data.customers.length, 'customer')}, ${plural(data.bills.length, 'bill')}`);
      render(true);
    } catch (e) {
      toast('Upload failed: ' + e.message, 'err');
      el.disabled = false;
      el.textContent = 'UPLOAD';
    }
  },

  // --- backup
  async exportBackup() {
    let data;
    try {
      data = await cloud.exportAll();
    } catch (e) {
      return toast('Could not read data: ' + e.message, 'err');
    }
    data = { app: 'aone-billing', version: APP_VERSION, exportedAt: now(), ...data };
    const name = `aone-backup-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.json`;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    let done = false;
    if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ files: [file], title: 'A One backup' });
        done = true;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    if (!done) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    local.set('lastBackupAt', now());
    toast('✓ Backup exported');
    render(true);
  },
  importBackup() { $('#importFile').click(); },
  async clearAll() {
    if (!navigator.onLine) return toast('Connect to the internet first', 'err');
    if (!await confirmBox({ title: 'Clear ALL data?', body: 'Products, customers, open bills and history will be erased <b>from the cloud and from every phone</b>. Export a backup first!', ok: 'ERASE', danger: true, typeToConfirm: 'DELETE' })) return;
    try {
      await cloud.deleteAll();
      S.olderBills = [];
      toast('All data cleared');
      go('/', true);
    } catch (e) {
      toast('Could not clear: ' + e.message, 'err');
    }
  },
};

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Draws the bill as a black-and-white image, 576 px wide (fits 80 mm
// thermal printers as well as normal paper and WhatsApp).
function receiptCanvas(b) {
  const W = 576;
  const P = 28;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 1000 + b.items.length * 210 + (b.payments?.length || 0) * 90;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, c.height);
  g.fillStyle = '#000';
  g.textBaseline = 'top';
  let y = P;
  const font = (size, bold) => (g.font = `${bold ? 700 : 400} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`);
  const fit = (t, max) => {
    if (g.measureText(t).width <= max) return t;
    while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  };
  const wrap = (t, max) => {
    const out = [];
    let line = '';
    for (const w of String(t).split(' ')) {
      const next = line ? line + ' ' + w : w;
      if (g.measureText(next).width > max && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    return out.concat(line ? [line] : []);
  };
  const text = (t, { size = 24, bold = false, align = 'left' } = {}) => {
    font(size, bold);
    g.textAlign = align;
    for (const l of wrap(t, W - 2 * P)) {
      g.fillText(l, align === 'center' ? W / 2 : align === 'right' ? W - P : P, y);
      y += Math.round(size * 1.3);
    }
  };
  const row = (left, right, { size = 24, bold = false } = {}) => {
    font(size, bold);
    const rw = g.measureText(right).width;
    g.textAlign = 'left';
    g.fillText(fit(left, W - 2 * P - rw - 16), P, y);
    g.textAlign = 'right';
    g.fillText(right, W - P, y);
    y += Math.round(size * 1.3);
  };
  const rule = (dashed = true) => {
    g.setLineDash(dashed ? [8, 6] : []);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(P, y + 6);
    g.lineTo(W - P, y + 6);
    g.stroke();
    y += 20;
  };
  const when = b.completedAt || b.updatedAt;
  text(S.shop.shopName, { size: 34, bold: true, align: 'center' });
  if (S.shop.shopAddress) text(S.shop.shopAddress, { size: 22, align: 'center' });
  if (S.shop.shopPhone) text('Ph: ' + S.shop.shopPhone, { size: 22, align: 'center' });
  rule();
  row(`Bill ${billLabel(b)}`, `${fmtDate(when)}, ${fmtTime(when)}`, { size: 22 });
  text(`Customer: ${billName(b)}${b.customerPhone ? ' · ' + b.customerPhone : ''}`, { size: 24, bold: true });
  if (b.remark) text(`Note: ${b.remark}`, { size: 21 });
  rule();
  const sec = billSections(b);
  const lines = list => list.forEach(it => {
    text(itemTitle(it) + (itemPayTag(b, it) ? `  (${itemPayTag(b, it)})` : ''), { size: 25, bold: true });
    row('   ' + calcOrPending(it, it.amount < 0), amountOrPending(it));
    if (it.note) noteLines(it.note).forEach(l => text('      ' + l, { size: 20 }));
    y += 6;
  });
  lines(sec.sales);
  if (sec.scrap.length) {
    if (sec.sales.length) {
      rule();
      row('Items total', money(sec.salesTotal), { size: 26, bold: true });
    }
    y += 14;
    text('SCRAP TAKEN (MINUS)', { size: 26, bold: true });
    y += 4;
    lines(sec.scrap);
    rule();
    row('Scrap total', money(sec.scrapTotal), { size: 26, bold: true });
  }
  rule(false);
  row(finalLabel(b), money(Math.abs(b.total)), { size: 34, bold: true });
  if (b.status === 'COMPLETED' && !b.isSettled) {
    b.payments.forEach(p => text(payLine(b, p), { size: 20 }));
    row('Paid', money(Math.abs(b.paid)), { size: 24 });
    row('BALANCE DUE', money(Math.abs(b.balance)), { size: 28, bold: true });
  }
  y += 8;
  text(b.status === 'CANCELLED' ? '*** CANCELLED ***' : b.status !== 'COMPLETED' ? 'ESTIMATE (not completed)' : b.isSettled ? 'PAID — Thank you!' : 'Thank you!', { size: 24, bold: true, align: 'center' });
  y += P;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = y;
  out.getContext('2d').drawImage(c, 0, 0);
  return out;
}
function shareBillImage(bill, forPrint = false) {
  shareImage(receiptCanvas(bill), `bill-${billLabel(bill).slice(1)}.png`, `Bill ${billLabel(bill)}`, forPrint);
}
function shareImage(canvas, name, title, forPrint = false) {
  // Built synchronously so the share menu still counts as a response to the tap (needed on iPhone).
  const url = canvas.toDataURL('image/png');
  const bin = atob(url.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    if (forPrint) toast('Choose “Print” in the menu');
    navigator.share({ files: [file], title }).catch(e => {
      if (e.name !== 'AbortError') downloadBlob(file, name);
    });
  } else {
    downloadBlob(file, name);
    toast('Bill image saved — open it to print');
  }
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function shareText(title, text) {
  try {
    if (navigator.share) await navigator.share({ title, text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it in WhatsApp/SMS');
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not share', 'err');
  }
}

function setBillCustomer({ id, name, phone, type }) {
  const bill = getBill(R.b);
  updateBill(bill, { customerChosen: true, customerId: id, customerName: name, customerPhone: phone || '', customerType: type });
  go(bill.items.length ? `/bill/${bill.id}` : `/bill/${bill.id}/add`, true);
}

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

const INPUTS = {
  custSearch: v => ($('#custResults').innerHTML = customerPickResults(v)),
  prodSearch: v => ($('#prodResults').innerHTML = productPickResults(v)),
  calcSearch: v => ($('#calcResults').innerHTML = calcResults(v)),
  billNote: v => {
    clearTimeout(noteTimer);
    const id = R.b;
    noteTimer = setTimeout(() => {
      const b = getBill(id);
      if (b && (b.remark || '') !== v.trim()) updateBill(b, { remark: v.trim() });
    }, 700);
  },
  calcQty: v => { calc.qty = v; saveCalc(); updateCalcPage(); },
  calcRate: v => { calc.rate = v; saveCalc(); updateCalcPage(); },
  custAdminSearch: v => ($('#custAdminResults').innerHTML = customerAdminResults(v)),
  prodAdminSearch: v => ($('#prodAdminResults').innerHTML = productAdminResults(v)),
  histSearch: v => ($('#histResults').innerHTML = historyResults(v)),
  qtyIn: updateCalc,
  rateIn: updateCalc,
  payIn: updatePayInfo,
  bnCust: v => ($('#bnCustResults').innerHTML = bnCustomerResults(v)),
  bnOut: v => { bnDraft.out = v; updateBundleNew(); },
  bnBox: v => { bnDraft.box = v; updateBundleNew(); },
  bnNote: v => { bnDraft.note = v; },
  bnSizeIn: v => {
    bnDraft.size = normSize(v);
    document.querySelectorAll('[data-act="bnSize"]').forEach(b => b.classList.remove('on'));
    updateBundleNew();
  },
  sizeIn: v => {
    sheetCtx.size = normSize(v);
    document.querySelectorAll('[data-act="pickSize"]').forEach(b => b.classList.remove('on'));
  },
  brBack: v => { bnReturn.back = v; updateBundleReturn(); },
  brRate: v => { bnReturn.rate = v; updateBundleReturn(); },
  qaName: updateQuick,
  qaQty: updateQuick,
  qaPrice: updateQuick,
};
document.addEventListener('input', e => INPUTS[e.target.id]?.(e.target.value));

const ENTER = {
  qtyIn: () => A.confirmQty(),
  rateIn: () => A.confirmQty(),
  priceIn: () => A.savePrice(),
  payIn: () => A.savePayment(),
  qaName: () => $('#qaQty').focus(),
  qaQty: () => $('#qaPrice').focus(),
  qaPrice: () => A.qaConfirm(),
  ooName: () => $('#ooPhone').focus(),
  ooPhone: () => A.confirmOneOff(),
  emuEmail: () => A.emuSignIn(),
  prodSearch: () => $('#prodResults [data-act="pickProduct"]')?.click(),
  calcSearch: () => $('#calcResults [data-act="calcPick"]')?.click(),
  calcQty: () => A.calcAdd(),
  calcRate: () => A.calcAdd(),
  custSearch: () => $('#custResults [data-act]')?.click(),
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeSheet();
  if (e.key === 'Enter' && ENTER[e.target.id]) {
    e.preventDefault();
    ENTER[e.target.id]();
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  const value = t.type === 'checkbox' ? t.checked : t.value.trim();
  if (t.dataset.shop) {
    S.shop[t.dataset.shop] = value;
    cloud.setMeta('shop', { [t.dataset.shop]: value });
    toast('✓ Saved for all phones');
  } else if (t.id === 'pfVarOn') {
    $('#varSection').hidden = !t.checked;
    $('.base-price').hidden = t.checked;
  } else if (t.id === 'bnSaveBox') {
    bnDraft.saveBox = t.checked;
  } else if (t.id === 'brWithBox') {
    bnReturn.withBox = t.checked;
    updateBundleReturn();
  } else if (t.classList.contains('payItem')) {
    const sum = round2([...document.querySelectorAll('.payItem:checked')].reduce((s2, x) => s2 + Number(x.dataset.amt), 0));
    $('#payIn').value = sum > 0 ? sum : Math.abs(sheetCtx.balance);
    updatePayInfo();
  } else if (t.id === 'qaScrap' || t.id === 'qaSave') {
    updateQuick();
  } else if (t.dataset.stl) {
    stl[t.dataset.stl] = t.value;
    render(true);
  } else if (t.dataset.rep) {
    rep[t.dataset.rep] = t.value;
    render(true);
  } else if (t.dataset.local === 'deviceCode') {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
    if (!code) return toast('Enter a letter', 'err');
    local.set('deviceCode', code);
    toast(`✓ New bills will be ${code}-…`);
    render(true);
  } else if (t.dataset.local) {
    local.set(t.dataset.local, value);
    toast('✓ Saved');
  } else if (t.id === 'importFile' && t.files[0]) {
    await importFile(t.files[0]);
    t.value = '';
  } else if (t.form?.id === 'prodForm') {
    const f = t.form;
    if (t.name === 'category') {
      const unit = CATEGORY_UNIT[t.value];
      f.unit.value = unit;
      f.priceType.value = UNIT_PRICE_TYPE[unit];
      f.allowDecimal.checked = UNITS[unit].decimal;
      f.querySelector(`[name=sign][value="${t.value === 'SCRAP' ? -1 : 1}"]`).checked = true;
    } else if (t.name === 'unit') {
      f.priceType.value = UNIT_PRICE_TYPE[t.value];
      f.allowDecimal.checked = UNITS[t.value].decimal;
    }
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const d = Object.fromEntries(new FormData(f));
  if (f.id === 'custForm') {
    d.name = (d.name || '').trim();
    if (!d.name) return toast('Enter customer name', 'err');
    const dup = S.customers.find(c => c.name.toLowerCase() === d.name.toLowerCase() && c.id !== f.dataset.id);
    if (dup && !await confirmBox({ title: `“${esc(d.name)}” already exists`, body: 'Save another customer with the same name?', ok: 'SAVE' })) return;
    saveCustomer(d, f.dataset.id ? getCustomer(f.dataset.id) : null);
    toast('✓ Customer saved');
    goBack('/customers');
  } else if (f.id === 'prodForm') {
    const name = (d.name || '').trim();
    if (!name) return toast('Enter product name', 'err');
    const mag = d.price ? num(d.price) : 0;
    if (isNaN(mag) || mag < 0) return toast('Enter a valid price', 'err');
    const optNum = v => (v === '' || v == null || isNaN(num(v)) ? null : num(v));
    if (d.unit === 'UNSET') return toast('Choose the unit (pcs, kg…)', 'err');
    const rowVal = (r, k) => r.querySelector(`[data-f="${k}"]`).value.trim();
    const variants = [...document.querySelectorAll('#varRows .var-row')].map(r => ({
      id: r.dataset.id || uid(), size: rowVal(r, 'size'), brand: rowVal(r, 'brand'), material: rowVal(r, 'material'),
      price: Number(d.sign) * (num(rowVal(r, 'price')) || 0) || 0,
    })).filter(v => v.size || v.brand || v.material || v.price);
    if (d.variantsOn && !variants.length) return toast('Add at least one size / brand / material row', 'err');
    if (d.variantsOn && variants.some(v => !v.price)) return toast('Enter a price for every row', 'err');
    if (d.priceType === 'UNSET') d.priceType = UNIT_PRICE_TYPE[d.unit];
    const existing = f.dataset.id ? getProduct(f.dataset.id) : null;
    const p = existing ? { ...existing } : makeProduct({ name, category: d.category });
    const price = Number(d.sign) * mag || 0;
    Object.assign(p, {
      name, category: d.category, unit: d.unit, priceType: d.priceType, price, isNegative: price < 0,
      sku: (d.sku || '').trim(), stock: optNum(d.stock), minStock: optNum(d.minStock), boxWeight: optNum(d.boxWeight),
      allowDecimal: !!d.allowDecimal, hasSize: !!d.hasSize, variantsOn: !!d.variantsOn, variants: d.variantsOn ? variants : p.variants || [], favourite: !!d.favourite, active: !!d.active, updatedAt: now(), needsReview: false,
    });
    S.products = S.products.filter(x => x.id !== p.id).concat(p);
    cloud.put('products', p);
    toast('✓ Product saved');
    goBack('/products');
  }
});

async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('That file is not a valid backup', 'err');
  }
  if (data.app !== 'aone-billing' || !Array.isArray(data.products) || !Array.isArray(data.bills)) {
    return toast('That file is not an A One backup', 'err');
  }
  if (!navigator.onLine) return toast('Connect to the internet to restore', 'err');
  const body = `Backup from ${data.exportedAt ? fmtDate(data.exportedAt) : 'unknown date'}: ${plural(data.products.length, 'product')}, ${plural((data.customers || []).length, 'customer')}, ${plural(data.bills.length, 'bill')}.<br><b>All current data in the cloud and on every phone will be replaced.</b>`;
  if (!await confirmBox({ title: 'Restore this backup?', body, ok: 'RESTORE', danger: true })) return;
  // v1 backups store settings as key/value rows and bill items as arrays.
  const meta = data.meta || (data.settings ? [{ id: 'shop', ...Object.fromEntries(data.settings.filter(r => r.key in DEFAULT_SHOP).map(r => [r.key, r.value])) }] : []);
  const dev = deviceCode();
  const bills = data.bills.map(b => billToDoc(billFromDoc({ ...b, device: b.device || dev })));
  try {
    toast('Restoring…');
    await cloud.deleteAll();
    await cloud.writeAll({ products: data.products, customers: data.customers || [], bills, meta });
    S.olderBills = [];
    toast('✓ Backup restored');
    go('/', true);
  } catch (e) {
    toast('Restore failed: ' + e.message, 'err');
  }
}

// ---------------------------------------------------------------- boot
async function checkLegacy() {
  try {
    if (local.get('migrated')) return;
    if (indexedDB.databases && !(await indexedDB.databases()).some(d => d.name === 'aone-billing')) return;
    const data = await legacyDb.exportAll();
    if (data.products.length || data.customers.length || data.bills.length) S.legacy = data;
  } catch { /* nothing to migrate */ }
}

function init() {
  if (local.get('lang', 'en') === 'hi') startHindi();
  if ((location.hash || '#/') === '#/' && local.get('startPage', 'home') === 'calc') {
    history.replaceState(null, '', '#/calc');
    nav.stack = ['#/calc'];
  }
  cloud.onError = e => {
    console.error(e);
    if (e.code === 'permission-denied') {
      S.denied = true;
      render();
    } else toast('⚠ Sync problem: ' + (e.message || e), 'err');
  };
  cloud.watchAuth(user => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    Object.assign(S, { user, denied: false, products: [], customers: [], bills: [], olderBills: [], bundles: [], loaded: {}, fromServer: {}, pending: {} });
    if (user) unsubscribe = cloud.subscribe(onData, cloud.onError, recentCutoff());
    render();
  });
  window.addEventListener('hashchange', onHashChange);
  render();
  checkLegacy().then(() => S.legacy && S.user && render(true));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  navigator.storage?.persist?.().catch(() => {});
}

init();
