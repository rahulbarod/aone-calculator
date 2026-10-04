import { db } from './db.js';
import { voice } from './voice.js';
import { scale } from './scale.js';

const APP_VERSION = '1.0.0';

// ---------------------------------------------------------------- constants
const UNITS = {
  KG: { label: 'kg', name: 'KG', decimal: true },
  GRAM: { label: 'g', name: 'GRAM', decimal: true },
  PCS: { label: 'pcs', name: 'PCS', decimal: false },
  BOX: { label: 'box', name: 'BOX', decimal: false },
  METER: { label: 'm', name: 'METER', decimal: true },
  OTHER: { label: 'unit', name: 'OTHER', decimal: true },
};
const PRICE_TYPES = {
  PER_KG: { label: 'Per kg', per: 'kg' },
  PER_GRAM: { label: 'Per gram', per: 'g' },
  PER_PIECE: { label: 'Per piece', per: 'pc' },
  PER_BOX: { label: 'Per box', per: 'box' },
  PER_METER: { label: 'Per meter', per: 'm' },
  FIXED: { label: 'Fixed', per: '' },
};
const UNIT_PRICE_TYPE = { KG: 'PER_KG', GRAM: 'PER_GRAM', PCS: 'PER_PIECE', BOX: 'PER_BOX', METER: 'PER_METER', OTHER: 'FIXED' };
const CATEGORIES = { WEIGHT: 'Weight based', PIECE: 'Piece based', SCRAP: 'Scrap', OTHER: 'Other' };
const CATEGORY_UNIT = { WEIGHT: 'KG', PIECE: 'PCS', SCRAP: 'KG', OTHER: 'PCS' };
const VOICE_LANGS = {
  'en-IN': 'English (India)', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'pa-IN': 'Punjabi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada',
};
const DEFAULT_SETTINGS = {
  shopName: 'A ONE ENTERPRISE', shopAddress: '', shopPhone: '',
  voiceLang: 'en-IN', showTodaySales: true, nextBillNo: 1, lastBackupAt: null, seeded: false,
};

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
const S = { products: [], customers: [], bills: [], settings: { ...DEFAULT_SETTINGS } };
window.AOne = { S, db, scale }; // handy for debugging in DevTools

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
function lineCalcText(it) {
  return `${fmtQty(it.quantity, it.unit)} ${unitLabel(it.unit, it.quantity)} × ${money(it.rate)}`;
}
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

async function persist(store, obj) {
  try {
    await db.put(store, obj);
  } catch (e) {
    console.error(e);
    toast('⚠ Could not save: ' + e.message, 'err');
  }
}
async function remove(store, key) {
  try {
    await db.del(store, key);
  } catch (e) {
    toast('⚠ Could not delete: ' + e.message, 'err');
  }
}
async function setSetting(key, value) {
  S.settings[key] = value;
  await persist('settings', { key, value });
}

// ---------------------------------------------------------------- lookups
const getBill = id => S.bills.find(b => b.id === id);
const getProduct = id => S.products.find(p => p.id === id);
const getCustomer = id => S.customers.find(c => c.id === id);
const activeBills = () => S.bills
  .filter(b => b.status === 'ACTIVE' || b.status === 'DRAFT')
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const billName = b => b.customerName || (b.customerChosen ? `Walk-in #${b.billNo}` : `New bill #${b.billNo}`);

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

function recalc(b) {
  b.subtotal = round2(b.items.reduce((s, i) => s + i.amount, 0));
  b.total = b.subtotal; // room for discount / GST later
  b.updatedAt = now();
}
async function saveBill(b) {
  recalc(b);
  if (!S.bills.includes(b)) S.bills.push(b);
  await persist('bills', b);
}
async function deleteBill(b) {
  S.bills = S.bills.filter(x => x !== b);
  await remove('bills', b.id);
}
async function createBill() {
  const no = S.settings.nextBillNo || 1;
  await setSetting('nextBillNo', no + 1);
  const b = {
    id: uid(), billNo: no, status: 'DRAFT', customerChosen: false,
    customerId: null, customerName: '', customerPhone: '', customerType: null,
    items: [], subtotal: 0, total: 0, createdAt: now(), updatedAt: now(), completedAt: null,
  };
  await saveBill(b);
  return b;
}
// Bills opened with "Add to bill" and abandoned before choosing anyone.
function purgeEmptyDrafts() {
  for (const b of S.bills.filter(b => b.status === 'DRAFT' && !b.customerChosen && !b.items.length)) deleteBill(b);
}
function todayStats() {
  const t = new Date().toISOString();
  const done = S.bills.filter(b => b.status === 'COMPLETED' && b.completedAt && sameDay(b.completedAt, t));
  return { count: done.length, total: round2(done.reduce((s, b) => s + b.total, 0)) };
}

// ---------------------------------------------------------------- routing
let R = { a: '', b: '', c: '' };

function go(path, replace = false) {
  const h = '#' + path;
  if (location.hash === h) render();
  else if (replace) location.replace(h);
  else location.hash = h;
}

function render(keepScroll = false) {
  const y = window.scrollY;
  closeSheet();
  const [a = '', b = '', c = ''] = location.hash.replace(/^#\/?/, '').split('/');
  R = { a, b, c };
  const html = route(a, b, c);
  if (html == null) return; // redirected
  app.innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
  if (a === 'settings') fillStorageInfo();
}

function route(a, b, c) {
  switch (a) {
    case '': return viewHome();
    case 'bills': return viewActiveBills();
    case 'bill': {
      const bill = getBill(b);
      if (!bill || bill.status === 'COMPLETED' || bill.status === 'CANCELLED') return go('/', true);
      if (c === 'customer') return viewCustomerPick(bill);
      if (!bill.customerChosen) return go(`/bill/${b}/customer`, true);
      if (c === 'add') return viewAddItem(bill);
      return viewBill(bill);
    }
    case 'done':
    case 'receipt': {
      const bill = getBill(b);
      return bill ? viewReceipt(bill, a === 'done' ? '/' : '/history') : go('/history', true);
    }
    case 'history': return viewHistory();
    case 'customers': return viewCustomers();
    case 'customer': return viewCustomerForm(b);
    case 'products': return viewProducts();
    case 'product': return viewProductForm(b);
    case 'settings': return viewSettings();
    default: return go('/', true);
  }
}

// ---------------------------------------------------------------- shared bits
function topbar(title, back, right = '') {
  return `<header class="topbar">${back != null ? `<a class="tb-back" href="#${back}" aria-label="Back">‹</a>` : ''}<h1>${title}</h1>${right}</header>`;
}
const micBtn = target => `<button type="button" class="mic" data-act="mic" data-target="${target}" aria-label="Speak name">🎤</button>`;

function billCard(b) {
  return `<button class="bill-card" data-act="openBill" data-id="${b.id}">
    <span class="dot ${b.items.length ? 'on' : ''}"></span>
    <span class="bc-name"><b>${esc(billName(b))}</b><small>${plural(b.items.length, 'item')} · #${b.billNo} · ${fmtTime(b.createdAt)}</small></span>
    <span class="bc-total ${b.total < 0 ? 'neg-text' : ''}">${money(b.total)}</span>
  </button>`;
}

// ---------------------------------------------------------------- views
function viewHome() {
  purgeEmptyDrafts();
  const act = activeBills();
  const t = todayStats();
  return `
  <header class="home-head">
    <div class="brand">${esc(S.settings.shopName)}</div>
    ${S.settings.showTodaySales ? `<div class="today"><span>₹ TODAY'S SALES</span><b>${money(t.total)}</b><small>${plural(t.count, 'bill')} completed</small></div>` : ''}
  </header>
  <main class="page">
    <button class="btn-hero" data-act="newBill"><span>＋</span>ADD TO BILL</button>
    <a class="sec-head" href="#/bills"><span>ACTIVE BILLS${act.length ? `<i class="count">${act.length}</i>` : ''}</span><span class="more">All ›</span></a>
    ${act.length ? `<div class="list">${act.slice(0, 6).map(billCard).join('')}</div>` : '<p class="empty">No open bills right now</p>'}
    ${act.length > 6 ? `<a class="btn-text" href="#/bills">+${act.length - 6} more bills</a>` : ''}
    <nav class="grid2">
      <a class="tile" href="#/customers"><span class="ti">👤</span>CUSTOMERS</a>
      <a class="tile" href="#/products"><span class="ti">📦</span>PRODUCTS</a>
      <a class="tile" href="#/history"><span class="ti">🧾</span>HISTORY</a>
      <a class="tile" href="#/settings"><span class="ti">⚙️</span>SETTINGS</a>
    </nav>
  </main>`;
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
  return `${topbar(`Bill #${bill.billNo} · Customer`, back)}
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
  return `${topbar(`Add item · ${esc(billName(bill))}`, `/bill/${bill.id}`)}
  <main class="page has-footer">
    <input id="prodSearch" class="input big" type="search" placeholder="🔍 Search product…" autocomplete="off" enterkeyhint="go">
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
    <span class="pt-name">${esc(p.name)}</span>
    <span class="pt-rate">${p.price ? rateText(p.price, p.priceType) : 'Enter rate'}</span></button>`;
}
function productPickResults(q) {
  const act = S.products.filter(p => p.active);
  if (q.trim()) {
    const m = searchProducts(act, q);
    return m.length ? `<div class="ptiles">${m.map(ptile).join('')}</div>` : `<p class="empty">No product matches “${esc(q)}”</p>`;
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
  const pos = round2(bill.items.filter(i => i.amount >= 0).reduce((s, i) => s + i.amount, 0));
  const neg = round2(bill.items.filter(i => i.amount < 0).reduce((s, i) => s + i.amount, 0));
  const c = bill.customerId ? getCustomer(bill.customerId) : null;
  const sub = [bill.customerPhone, bill.customerType === 'REGULAR' ? 'Regular' : 'One-off'].filter(Boolean).join(' · ');
  return `${topbar(`Bill #${bill.billNo}`, '/', `<span class="status">${bill.status}</span>`)}
  <nav class="switcher">
    ${act.map(b => `<button class="chip ${b.id === bill.id ? 'on' : ''}" data-act="openBill" data-id="${b.id}"><b>${esc(billName(b))}</b><small>${money(b.total)}</small></button>`).join('')}
    <button class="chip add" data-act="newBill">＋ New</button>
  </nav>
  <main class="page has-footer-lg">
    <button class="cust-card" data-act="changeCustomer">
      <span class="cc-ico">👤</span>
      <span class="cc-main"><small>CUSTOMER</small><b>${esc(billName(bill))}</b>${sub ? `<small>${esc(sub)}${c && c.notes ? ' · ' + esc(c.notes) : ''}</small>` : ''}</span>
      <span class="link">Change</span>
    </button>
    ${bill.items.length
      ? `<div class="items">${bill.items.map(itemRow).join('')}</div>`
      : '<div class="empty big">No items yet.<br>Tap <b>＋ ADD ITEM</b> below.</div>'}
    ${neg && pos ? `<div class="breakdown"><div><span>Items</span><b>${money(pos)}</b></div><div class="neg-text"><span>Scrap / return</span><b>${money(neg)}</b></div></div>` : ''}
  </main>
  <footer class="footbar bill-foot">
    <div class="total-row"><span>${bill.total < 0 ? 'PAY TO CUSTOMER' : 'TOTAL'}</span><b class="${bill.total < 0 ? 'neg-text' : ''}">${money(Math.abs(bill.total))}</b></div>
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
  return `<button class="item ${neg ? 'neg' : ''}" data-act="editItem" data-id="${it.id}">
    <span class="it-main"><span class="it-name">${esc(it.productName)}${neg ? '<span class="tag scrap">SCRAP</span>' : ''}</span>
    <span class="it-calc">${lineCalcText(it)}</span></span>
    <span class="it-amt">${money(it.amount)}</span></button>`;
}

// --- receipt
function receiptHtml(b) {
  const s = S.settings;
  const when = b.completedAt || b.updatedAt;
  return `<article class="receipt" id="receipt">
    <div class="r-shop">${esc(s.shopName)}</div>
    ${s.shopAddress ? `<div class="r-sub">${esc(s.shopAddress)}</div>` : ''}
    ${s.shopPhone ? `<div class="r-sub">📞 ${esc(s.shopPhone)}</div>` : ''}
    <div class="r-meta"><span>Bill #${b.billNo}</span><span>${fmtDate(when)}, ${fmtTime(when)}</span></div>
    <div class="r-cust">Customer: <b>${esc(billName(b))}</b>${b.customerPhone ? ` · ${esc(b.customerPhone)}` : ''}</div>
    <div class="r-items">${b.items.map(it => `<div class="r-item ${it.amount < 0 ? 'neg' : ''}">
      <div class="r-name">${esc(it.productName)}${it.amount < 0 ? ' <span class="tag scrap">SCRAP</span>' : ''}</div>
      <div class="r-line"><span>${lineCalcText(it)}</span><b>${money(it.amount)}</b></div></div>`).join('')}</div>
    <div class="r-total"><span>${b.total < 0 ? 'PAID TO CUSTOMER' : 'TOTAL'}</span>${b.status === 'CANCELLED' ? '<i class="stamp">CANCELLED</i>' : b.status === 'COMPLETED' ? '<i class="stamp ok">DONE</i>' : ''}<b>${money(Math.abs(b.total))}</b></div>
    <div class="r-foot">${plural(b.items.length, 'item')} · Thank you!</div>
  </article>`;
}
function receiptText(b) {
  const when = b.completedAt || b.updatedAt;
  const lines = [
    S.settings.shopName, S.settings.shopAddress, S.settings.shopPhone && `Ph: ${S.settings.shopPhone}`,
    `Bill #${b.billNo} · ${fmtDate(when)} ${fmtTime(when)}`,
    `Customer: ${billName(b)}${b.customerPhone ? ' (' + b.customerPhone + ')' : ''}`,
    '------------------------------',
    ...b.items.map(it => `${it.productName}\n  ${lineCalcText(it)} = ${money(it.amount)}`),
    '------------------------------',
    `${b.total < 0 ? 'PAID TO CUSTOMER' : 'TOTAL'}: ${money(Math.abs(b.total))}`,
    b.status === 'CANCELLED' ? '*** CANCELLED ***' : 'Thank you!',
  ];
  return lines.filter(Boolean).join('\n');
}
function viewReceipt(bill, back) {
  return `${topbar(`Bill #${bill.billNo}`, back, `<span class="status">${bill.status}</span>`)}
  <main class="page">
    ${receiptHtml(bill)}
    <div class="btn-row">
      <button class="btn-mid" data-act="shareBill" data-id="${bill.id}">📤 SHARE</button>
      <button class="btn-mid" data-act="printBill">🖨 PRINT</button>
    </div>
    <button class="btn-big go" data-act="newBill">＋ NEW BILL</button>
    <a class="btn-mid" href="#/">HOME</a>
  </main>`;
}

// --- history
function viewHistory() {
  return `${topbar('History', '/')}
  <main class="page">
    <input id="histSearch" class="input big" type="search" placeholder="🔍 Customer name or bill #" autocomplete="off">
    <div id="histResults">${historyResults('')}</div>
  </main>`;
}
function historyResults(q) {
  const s = q.trim().toLowerCase().replace(/^#/, '');
  const when = b => b.completedAt || b.updatedAt;
  const list = S.bills
    .filter(b => b.status === 'COMPLETED' || b.status === 'CANCELLED')
    .filter(b => !s || billName(b).toLowerCase().includes(s) || String(b.billNo) === s || (b.customerPhone || '').includes(s))
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, 400);
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
      <span class="h-main"><b>${esc(billName(b))}</b><small>${plural(b.items.length, 'item')} · #${b.billNo}${b.status === 'CANCELLED' ? ' · <span class="tag cancel">CANCELLED</span>' : ''}</small></span>
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
  return `<div class="sec-label">${plural(list.length, 'customer')}</div>` + list.map(c => `<a class="row" href="#/customer/${c.id}">
    <span class="row-main"><b>${esc(c.name)}</b><small>${esc([c.phone, c.type === 'ONE_OFF' ? 'One-off' : '', c.address].filter(Boolean).join(' · ')) || '&nbsp;'}</small></span><span class="chev">›</span></a>`).join('');
}
function viewCustomerForm(id) {
  const isNew = id === 'new';
  const c = isNew ? { name: '', phone: '', address: '', notes: '', type: 'REGULAR' } : getCustomer(id);
  if (!c) return go('/customers', true);
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
function viewProducts() {
  return `${topbar('Products', '/', '<a class="tb-act" href="#/product/new">＋ Add</a>')}
  <main class="page">
    <input id="prodAdminSearch" class="input big" type="search" placeholder="🔍 Product or SKU" autocomplete="off">
    <p class="hint">Tap ★ for quick items. Tap the price to change it.</p>
    <div id="prodAdminResults" class="list">${productAdminResults('')}</div>
    <a class="btn-big alt" href="#/product/new">＋ ADD PRODUCT</a>
  </main>`;
}
function prow(p) {
  const neg = p.price < 0;
  const low = typeof p.stock === 'number' && typeof p.minStock === 'number' && p.stock <= p.minStock;
  const info = [CATEGORIES[p.category], p.sku,
    typeof p.stock === 'number' ? `Stock: ${fmtQty(p.stock, p.unit)} ${unitLabel(p.unit, p.stock)}` : '',
    p.active ? '' : 'INACTIVE'].filter(Boolean).map(esc).join(' · ');
  return `<div class="prow ${p.active ? '' : 'inactive'} ${neg ? 'negp' : ''}">
    <button class="star ${p.favourite ? 'on' : ''}" data-act="toggleFav" data-id="${p.id}" aria-label="Favourite">★</button>
    <a class="pr-main" href="#/product/${p.id}"><b>${esc(p.name)}</b><small>${info}${low ? ' <span class="low">⚠ LOW</span>' : ''}</small></a>
    <button class="pr-price" data-act="editPrice" data-id="${p.id}">${p.price ? rateText(p.price, p.priceType) : 'At billing'}<small>EDIT PRICE</small></button>
  </div>`;
}
function productAdminResults(q) {
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
function viewProductForm(id) {
  const isNew = id === 'new';
  const p = isNew ? makeProduct({ name: '', category: 'PIECE', price: 0 }) : getProduct(id);
  if (!p) return go('/products', true);
  const sign = p.price < 0 || (isNew && p.category === 'SCRAP') ? -1 : 1;
  const opts = (obj, sel, fn) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${fn(v, k)}</option>`).join('');
  return `${topbar(isNew ? 'New product' : 'Edit product', '/products')}
  <main class="page">
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
      <div class="price-row"><span>₹</span><input name="price" class="input big" inputmode="decimal" value="${p.price ? Math.abs(p.price) : ''}" placeholder="0"></div>
      <p class="hint">Leave 0 to type the rate at billing time (for "Other" items).</p>
      <label class="lbl" for="pfSku">SKU / CODE (optional)</label>
      <input id="pfSku" name="sku" class="input big" value="${esc(p.sku)}">
      <div class="two">
        <div><label class="lbl" for="pfStock">STOCK (optional)</label><input id="pfStock" name="stock" class="input big" inputmode="decimal" value="${p.stock ?? ''}"></div>
        <div><label class="lbl" for="pfMin">MIN. STOCK</label><input id="pfMin" name="minStock" class="input big" inputmode="decimal" value="${p.minStock ?? ''}"></div>
      </div>
      <label class="check"><input type="checkbox" name="allowDecimal" ${p.allowDecimal ? 'checked' : ''}> Allow decimal quantity (e.g. 2.5)</label>
      <label class="check"><input type="checkbox" name="favourite" ${p.favourite ? 'checked' : ''}> ⭐ Quick item (show at top)</label>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active (show when billing)</label>
      <button class="btn-big go" type="submit">SAVE PRODUCT</button>
      ${isNew ? '' : `<button type="button" class="btn-text danger" data-act="deleteProduct" data-id="${p.id}">Delete product</button>`}
    </form>
  </main>`;
}

// --- settings
function viewSettings() {
  const s = S.settings;
  const counts = `${plural(S.products.length, 'product')} · ${plural(S.customers.length, 'customer')} · ${plural(S.bills.length, 'bill')}`;
  return `${topbar('Settings', '/')}
  <main class="page">
    <section class="card"><h2>Shop</h2>
      <label class="lbl" for="sName">SHOP NAME</label><input id="sName" class="input big" data-setting="shopName" value="${esc(s.shopName)}">
      <label class="lbl" for="sAddr">ADDRESS (printed on bill)</label><input id="sAddr" class="input big" data-setting="shopAddress" value="${esc(s.shopAddress)}">
      <label class="lbl" for="sPhone">PHONE (printed on bill)</label><input id="sPhone" class="input big" type="tel" data-setting="shopPhone" value="${esc(s.shopPhone)}">
      <label class="check"><input type="checkbox" data-setting="showTodaySales" ${s.showTodaySales ? 'checked' : ''}> Show today's sales on home screen</label>
    </section>
    <section class="card"><h2>Voice input</h2>
      <label class="lbl" for="sLang">LANGUAGE</label>
      <select id="sLang" class="input big" data-setting="voiceLang">${Object.entries(VOICE_LANGS).map(([k, v]) => `<option value="${k}" ${k === s.voiceLang ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <p class="hint">${voice.supported ? '✅ Voice input works in this browser.' : '⚠ This browser has no voice input — the keyboard is used instead.'} Chrome's voice recognition usually needs internet; everything else works offline.</p>
    </section>
    <section class="card"><h2>Weighing machine</h2>
      <p>Current: <b>${esc(scale.name)}</b></p>
      <p class="hint">Type the weight shown on the machine. Bluetooth scale support can be added in a later version.</p>
    </section>
    <section class="card"><h2>Backup</h2>
      <p>Last backup: <b>${s.lastBackupAt ? `${fmtDate(s.lastBackupAt)}, ${fmtTime(s.lastBackupAt)}` : 'Never'}</b></p>
      <p class="hint">Data is stored only on this phone. Export a backup every week and keep a copy on WhatsApp / Drive.</p>
      <button class="btn-mid" data-act="exportBackup">⬇ EXPORT BACKUP</button>
      <button class="btn-mid" data-act="importBackup">⬆ IMPORT BACKUP</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </section>
    <section class="card"><h2>Data</h2>
      <p>${counts}</p>
      <p class="hint" id="storageInfo">Checking storage…</p>
      <button class="btn-mid" data-act="loadSamples">Add sample products</button>
      <button class="btn-mid danger" data-act="clearAll">🗑 CLEAR ALL DATA</button>
    </section>
    <p class="ver">A One Billing v${APP_VERSION} · works offline</p>
  </main>`;
}
async function fillStorageInfo() {
  const el = $('#storageInfo');
  if (!el) return;
  try {
    const persisted = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    const kb = est ? Math.round(est.usage / 1024) : null;
    el.textContent = `${persisted ? '🔒 Protected storage' : 'Standard storage (install the app to protect it)'}${kb != null ? ` · ${kb} KB used` : ''}`;
  } catch {
    el.textContent = '';
  }
}

// ---------------------------------------------------------------- sheet & modal
let sheetCtx = null;
function openSheet(html) {
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
  w.hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() {
  const w = $('#sheet');
  if (w.hidden) return;
  w.hidden = true;
  w.innerHTML = '';
  sheetCtx = null;
  document.body.classList.remove('noscroll');
}
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

function confirmBox({ title, body = '', ok = 'YES', cancel = 'NO', danger = false, typeToConfirm = null }) {
  return new Promise(resolve => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal" role="alertdialog"><h3>${title}</h3>${body ? `<p>${body}</p>` : ''}
      ${typeToConfirm ? `<input id="mConfirm" class="input big" placeholder="Type ${typeToConfirm}" autocomplete="off">` : ''}
      <div class="btn-row"><button class="btn-mid" data-m="0">${cancel}</button><button class="btn-mid ${danger ? 'danger-fill' : 'go'}" data-m="1">${ok}</button></div></div>`;
    m.hidden = false;
    m.onclick = e => {
      const b = e.target.closest('[data-m]');
      if (!b && e.target !== m) return;
      const yes = !!b && b.dataset.m === '1';
      if (yes && typeToConfirm && $('#mConfirm').value.trim().toUpperCase() !== typeToConfirm) {
        toast(`Type ${typeToConfirm} to confirm`, 'err');
        return;
      }
      m.hidden = true;
      m.innerHTML = '';
      m.onclick = null;
      resolve(yes);
    };
  });
}

// --- quantity / weight entry
function openQtySheet(billId, productId, itemId = null) {
  const bill = getBill(billId);
  const item = itemId ? bill.items.find(i => i.id === itemId) : null;
  const p = item ? null : getProduct(productId);
  if (!item && !p) return;
  const src = item
    ? { name: item.productName, category: item.category, unit: item.unit, priceType: item.priceType, rate: item.rate, allowDecimal: item.allowDecimal ?? UNITS[item.unit].decimal }
    : { name: p.name, category: p.category, unit: p.unit, priceType: p.priceType, rate: p.price, allowDecimal: p.allowDecimal };
  const sign = src.rate < 0 || (!src.rate && src.category === 'SCRAP') ? -1 : 1;
  sheetCtx = { billId, productId: item ? item.productId : p.id, itemId, sign, ...src };
  const neg = sign < 0;
  const needRate = !src.rate;
  const per = PRICE_TYPES[src.priceType]?.per;
  const u = UNITS[src.unit].label;
  const startQty = item ? item.quantity : (src.allowDecimal ? '' : '1');
  openSheet(`
    <div class="sheet-head ${neg ? 'neg' : ''}">
      <div><div class="sh-title">${esc(src.name)}${neg ? ' <span class="tag scrap">SCRAP</span>' : ''}</div>
      <div class="sh-sub">Rate: <b id="rateShow">${needRate ? '—' : rateText(src.rate, src.priceType)}</b>
        ${needRate ? '' : '<button type="button" class="link" data-act="toggleRate">change</button>'}</div></div>
      <button type="button" class="x" data-act="closeSheet" aria-label="Close">✕</button>
    </div>
    <div id="rateBox" class="rate-box" ${needRate ? '' : 'hidden'}>
      <label class="lbl" for="rateIn">RATE ₹${per ? ' / ' + per : ''}${neg ? ' (deducted from bill)' : ''}</label>
      <input id="rateIn" class="input big" inputmode="decimal" autocomplete="off" value="${src.rate ? Math.abs(src.rate) : ''}" placeholder="0">
      <small class="hint">For this bill only — catalogue price stays the same.</small>
    </div>
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
    out.innerHTML = `<span>${rate ? 'Enter ' + qtyWord(sheetCtx.unit).toLowerCase() : 'Enter rate'}</span><b>&nbsp;</b>`;
  }
  $('#qtyGo').disabled = !(q > 0 && rate);
}

// ---------------------------------------------------------------- actions
let busy = false;
const A = {
  closeSheet,

  async newBill() {
    if (busy) return;
    busy = true;
    try {
      const b = await createBill();
      go(`/bill/${b.id}/customer`);
    } finally {
      busy = false;
    }
  },
  openBill(el) {
    const b = getBill(el.dataset.id);
    if (b) go(b.customerChosen ? `/bill/${b.id}` : `/bill/${b.id}/customer`);
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
      input.value = await voice.listen(S.settings.voiceLang);
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
  async pickCustomer(el) {
    const c = getCustomer(el.dataset.id);
    await setBillCustomer({ id: c.id, name: c.name, phone: c.phone, type: 'REGULAR' });
  },
  async useTypedName() {
    await setBillCustomer({ id: null, name: $('#custSearch').value.trim(), phone: '', type: 'ONE_OFF' });
  },
  async saveTypedName() {
    const c = await saveCustomer({ name: $('#custSearch').value.trim() });
    await setBillCustomer({ id: c.id, name: c.name, phone: '', type: 'REGULAR' });
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
  async confirmOneOff() {
    const name = $('#ooName').value.trim();
    const phone = $('#ooPhone').value.trim();
    if ($('#ooSave').checked && name) {
      const c = await saveCustomer({ name, phone });
      return setBillCustomer({ id: c.id, name, phone, type: 'REGULAR' });
    }
    await setBillCustomer({ id: null, name, phone, type: 'ONE_OFF' });
  },

  // --- items
  pickProduct(el) { openQtySheet(R.b, el.dataset.id); },
  editItem(el) { openQtySheet(R.b, null, el.dataset.id); },
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
  async confirmQty() {
    const ctx = sheetCtx;
    if (!ctx || busy) return;
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
    const bill = getBill(ctx.billId);
    const amount = lineAmount(q, rate, ctx.unit, ctx.priceType);
    if (ctx.itemId) {
      Object.assign(bill.items.find(i => i.id === ctx.itemId), { quantity: q, rate, amount, isNegative: rate < 0 });
    } else {
      bill.items.push({
        id: uid(), billId: bill.id, productId: ctx.productId, productName: ctx.name, category: ctx.category,
        unit: ctx.unit, priceType: ctx.priceType, allowDecimal: ctx.allowDecimal,
        quantity: q, rate, amount, isNegative: rate < 0, addedAt: now(),
      });
    }
    if (bill.status === 'DRAFT') bill.status = 'ACTIVE';
    busy = true;
    try {
      await saveBill(bill);
    } finally {
      busy = false;
    }
    toast(`${ctx.itemId ? 'Updated' : '✓ Added'} ${ctx.name}  ${money(amount)}`);
    render(true);
  },
  async removeItem() {
    const ctx = sheetCtx;
    const bill = getBill(ctx.billId);
    const it = bill.items.find(i => i.id === ctx.itemId);
    if (!await confirmBox({ title: `Remove ${esc(it.productName)}?`, body: `${lineCalcText(it)} = ${money(it.amount)}`, ok: 'REMOVE', danger: true })) return;
    bill.items = bill.items.filter(i => i !== it);
    await saveBill(bill);
    toast('Item removed');
    render(true);
  },

  // --- bill actions
  async saveBill() {
    const bill = getBill(R.b);
    if (bill.status === 'DRAFT') bill.status = 'ACTIVE';
    await saveBill(bill);
    toast('✓ Bill saved');
    go('/');
  },
  async completeBill() {
    const bill = getBill(R.b);
    if (!bill.items.length) return toast('Add at least one item first', 'err');
    const amt = bill.total < 0 ? `Pay to customer <b>${money(Math.abs(bill.total))}</b>` : `Total <b>${money(bill.total)}</b>`;
    if (!await confirmBox({ title: `Complete bill for ${esc(billName(bill))}?`, body: `${plural(bill.items.length, 'item')} · ${amt}`, ok: '✓ COMPLETE' })) return;
    bill.status = 'COMPLETED';
    bill.completedAt = now();
    await saveBill(bill);
    adjustStock(bill);
    if (bill.customerId) {
      const c = getCustomer(bill.customerId);
      if (c) {
        c.lastBilledAt = bill.completedAt;
        persist('customers', c);
      }
    }
    toast('✓ Bill completed');
    go(`/done/${bill.id}`, true);
  },
  async cancelBill() {
    const bill = getBill(R.b);
    if (!await confirmBox({ title: `Cancel bill for ${esc(billName(bill))}?`, body: bill.items.length ? `${plural(bill.items.length, 'item')} · ${money(bill.total)} will be cancelled.` : '', ok: 'CANCEL BILL', cancel: 'KEEP', danger: true })) return;
    if (bill.items.length) {
      bill.status = 'CANCELLED';
      await saveBill(bill);
    } else {
      await deleteBill(bill);
    }
    toast('Bill cancelled');
    go('/', true);
  },
  async shareBill(el) {
    const bill = getBill(el.dataset.id);
    const text = receiptText(bill);
    try {
      if (navigator.share) await navigator.share({ title: `Bill #${bill.billNo}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Bill copied — paste it in WhatsApp/SMS');
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast('Could not share', 'err');
    }
  },
  printBill() { window.print(); },

  // --- customers
  async billForCustomer(el) {
    const c = getCustomer(el.dataset.id);
    const b = await createBill();
    Object.assign(b, { customerChosen: true, customerId: c.id, customerName: c.name, customerPhone: c.phone, customerType: 'REGULAR' });
    await saveBill(b);
    go(`/bill/${b.id}/add`);
  },
  async deleteCustomer(el) {
    const c = getCustomer(el.dataset.id);
    if (!await confirmBox({ title: `Delete ${esc(c.name)}?`, body: 'Old bills keep the name. This cannot be undone.', ok: 'DELETE', danger: true })) return;
    S.customers = S.customers.filter(x => x !== c);
    await remove('customers', c.id);
    toast('Customer deleted');
    go('/customers', true);
  },

  // --- products
  async toggleFav(el) {
    const p = getProduct(el.dataset.id);
    p.favourite = !p.favourite;
    p.updatedAt = now();
    await persist('products', p);
    el.classList.toggle('on', p.favourite);
    toast(p.favourite ? `⭐ ${p.name} added to quick items` : `${p.name} removed from quick items`);
  },
  editPrice(el) {
    const p = getProduct(el.dataset.id);
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
      <p class="hint">Applies to items added from now on. Existing bills keep the price they were made with.</p>
      <button type="button" class="btn-big go" data-act="savePrice">SAVE PRICE</button>`);
    $('#priceIn').focus();
    $('#priceIn').select();
  },
  setSign(el) {
    sheetCtx.sign = Number(el.dataset.s);
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
  },
  async savePrice() {
    const p = getProduct(sheetCtx.productId);
    const v = num($('#priceIn').value);
    if (isNaN(v) || v < 0) return toast('Enter a valid price', 'err');
    const old = p.price;
    p.price = sheetCtx.sign * v;
    p.isNegative = p.price < 0;
    p.updatedAt = now();
    await persist('products', p);
    toast(`✓ ${p.name}: ${money(old)} → ${money(p.price)}`);
    render(true);
  },
  async deleteProduct(el) {
    const p = getProduct(el.dataset.id);
    if (!await confirmBox({ title: `Delete ${esc(p.name)}?`, body: 'Old bills are not affected. Tip: you can mark it Inactive instead.', ok: 'DELETE', danger: true })) return;
    S.products = S.products.filter(x => x !== p);
    await remove('products', p.id);
    toast('Product deleted');
    go('/products', true);
  },

  // --- settings / backup
  async exportBackup() {
    const data = { app: 'aone-billing', version: APP_VERSION, exportedAt: now(), ...(await db.exportAll()) };
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
    await setSetting('lastBackupAt', now());
    toast('✓ Backup exported');
    render(true);
  },
  importBackup() { $('#importFile').click(); },
  async loadSamples() {
    const have = new Set(S.products.map(p => p.name.toLowerCase()));
    const add = SAMPLE_PRODUCTS.filter(r => !have.has(r[0].toLowerCase())).map(sampleToProduct);
    if (!add.length) return toast('Sample products already present');
    S.products.push(...add);
    await db.putMany('products', add);
    toast(`Added ${plural(add.length, 'product')}`);
    render(true);
  },
  async clearAll() {
    if (!await confirmBox({ title: 'Clear ALL data?', body: 'Products, customers, open bills and history will be erased from this phone. Export a backup first!', ok: 'ERASE', danger: true, typeToConfirm: 'DELETE' })) return;
    await db.clearAll();
    S.products = [];
    S.customers = [];
    S.bills = [];
    S.settings = { ...DEFAULT_SETTINGS, seeded: true };
    await db.putMany('settings', Object.entries(S.settings).map(([key, value]) => ({ key, value })));
    toast('All data cleared');
    go('/', true);
  },
};

async function setBillCustomer({ id, name, phone, type }) {
  const bill = getBill(R.b);
  Object.assign(bill, { customerChosen: true, customerId: id, customerName: name, customerPhone: phone || '', customerType: type });
  await saveBill(bill);
  go(bill.items.length ? `/bill/${bill.id}` : `/bill/${bill.id}/add`, true);
}
async function saveCustomer(f, existing = null) {
  const c = existing || { id: uid(), createdAt: now(), lastBilledAt: null };
  Object.assign(c, { name: f.name, phone: f.phone || '', address: f.address || '', notes: f.notes || '', type: f.type || 'REGULAR', updatedAt: now() });
  if (!existing) S.customers.push(c);
  await persist('customers', c);
  return c;
}
function adjustStock(bill) {
  for (const it of bill.items) {
    const p = getProduct(it.productId);
    if (p && typeof p.stock === 'number' && p.unit === it.unit) {
      p.stock = round3(p.stock + (it.rate < 0 ? it.quantity : -it.quantity)); // scrap comes in, sales go out
      p.updatedAt = now();
      persist('products', p);
    }
  }
}
function sampleToProduct([name, category, unit, price, favourite, stock]) {
  return makeProduct({ name, category, unit, price, favourite, stock, minStock: stock != null ? (unit === 'KG' ? 10 : 10) : null });
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
  custAdminSearch: v => ($('#custAdminResults').innerHTML = customerAdminResults(v)),
  prodAdminSearch: v => ($('#prodAdminResults').innerHTML = productAdminResults(v)),
  histSearch: v => ($('#histResults').innerHTML = historyResults(v)),
  qtyIn: updateCalc,
  rateIn: updateCalc,
};
document.addEventListener('input', e => INPUTS[e.target.id]?.(e.target.value));

const ENTER = {
  qtyIn: () => A.confirmQty(),
  rateIn: () => A.confirmQty(),
  priceIn: () => A.savePrice(),
  ooName: () => $('#ooPhone').focus(),
  ooPhone: () => A.confirmOneOff(),
  prodSearch: () => $('#prodResults [data-act="pickProduct"]')?.click(),
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
  if (t.dataset.setting) {
    await setSetting(t.dataset.setting, t.type === 'checkbox' ? t.checked : t.value.trim());
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
    await saveCustomer(d, f.dataset.id ? getCustomer(f.dataset.id) : null);
    toast('✓ Customer saved');
    go('/customers', true);
  } else if (f.id === 'prodForm') {
    const name = (d.name || '').trim();
    if (!name) return toast('Enter product name', 'err');
    const mag = d.price ? num(d.price) : 0;
    if (isNaN(mag) || mag < 0) return toast('Enter a valid price', 'err');
    const optNum = v => (v === '' || v == null || isNaN(num(v)) ? null : num(v));
    const existing = f.dataset.id ? getProduct(f.dataset.id) : null;
    const p = existing || makeProduct({ name, category: d.category });
    const price = Number(d.sign) * mag || 0;
    Object.assign(p, {
      name, category: d.category, unit: d.unit, priceType: d.priceType, price, isNegative: price < 0,
      sku: (d.sku || '').trim(), stock: optNum(d.stock), minStock: optNum(d.minStock),
      allowDecimal: !!d.allowDecimal, favourite: !!d.favourite, active: !!d.active, updatedAt: now(),
    });
    if (!existing) S.products.push(p);
    await persist('products', p);
    toast('✓ Product saved');
    go('/products', true);
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
  const body = `Backup from ${data.exportedAt ? fmtDate(data.exportedAt) : 'unknown date'}: ${plural(data.products.length, 'product')}, ${plural((data.customers || []).length, 'customer')}, ${plural(data.bills.length, 'bill')}.<br><b>All current data on this phone will be replaced.</b>`;
  if (!await confirmBox({ title: 'Restore this backup?', body, ok: 'RESTORE', danger: true })) return;
  try {
    await db.replaceAll(data);
    await load();
    toast('✓ Backup restored');
    go('/', true);
  } catch (e) {
    toast('Restore failed: ' + e.message, 'err');
  }
}

// ---------------------------------------------------------------- boot
async function load() {
  const [products, customers, bills, settingsRows] = await Promise.all(['products', 'customers', 'bills', 'settings'].map(s => db.all(s)));
  S.products = products;
  S.customers = customers;
  S.bills = bills;
  S.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(settingsRows.map(r => [r.key, r.value])) };
  if (!S.settings.seeded) {
    S.products = SAMPLE_PRODUCTS.map(sampleToProduct);
    await db.putMany('products', S.products);
    await setSetting('seeded', true);
  }
}

async function init() {
  try {
    await load();
  } catch (e) {
    app.innerHTML = `<div class="boot">⚠ Could not open local storage.<br>${esc(e.message)}</div>`;
    return;
  }
  window.addEventListener('hashchange', () => render());
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  navigator.storage?.persist?.().catch(() => {});
}

init();
