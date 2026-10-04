# A One Enterprise — Billing & Weight Calculator (v2.2, cloud sync)

Offline-first PWA for counter billing. Plain HTML/CSS/JS, no build step.
Products, customers and bills sync live between phones through Firebase (Firestore),
and each phone keeps a full offline copy.

## One-time Firebase setup (project `aone-billing`)

1. **Firestore Database → Create database** (location `asia-south1`, production mode) if not done yet.
2. **Authentication → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains → Add domain:** your GitHub Pages domain, e.g. `your-username.github.io`.
4. **Firestore Database → Rules:** paste the contents of `firestore.rules`, put the two allowed Gmail
   addresses in the list, and click **Publish**. Only those accounts can read or change data.

## Put it on your phone

Upload all files to the GitHub repo (replacing the old ones). GitHub Pages republishes in a minute or two.
On each phone open the link in Chrome → ⋮ → **Install app / Add to Home screen**, then sign in with Google once.

The first phone that had data from v1 shows **"Move this phone's data to the cloud" → UPLOAD**.
Do that on the phone with the most data first; on the second phone the same card skips products/customers that already exist.

Give each phone a different **bill letter** (Settings → Account & sync), e.g. `R` and `P`,
so bills are numbered R-1, R-2… and P-1, P-2… and never clash even when both work offline.

## Updating the app later

Change the files, then bump `VERSION` in `sw.js` (e.g. `aone-v2.0.1`) and re-upload.
Phones get the new version the next time the app is opened twice.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `css/app.css` | All styling (mobile-first, large touch targets) |
| `js/app.js` | Screens, billing logic, routing |
| `js/cloud.js` | Firebase config, Google sign-in, live sync, offline cache |
| `js/db.js` | Reads data saved by v1 (before sync) for the one-time upload |
| `js/parse.js` | Understands spoken new-product lines ("thrust bearing 80 no. 365 rs") |
| `js/voice.js` | Speech-to-text for customer names, with keyboard fallback |
| `js/scale.js` | Weighing-machine adapter slot (manual entry for now) |
| `sw.js` | Offline cache for the app files and Firebase library |
| `firestore.rules` | Security rules — who may access the data |
| `manifest.json`, `icons/` | Install / home-screen icon |

## Reports & dues (v2.1)

- **Reports** (home → 📊): Today / Yesterday / This week / This month / Last month / Custom range.
  Summary (net sales, items sold, scrap, cash received, still due, by-day chart), by product, by customer. 📤 shares the summary as text.
- **Completing a bill**: ✓ PAID (default) or PAY LATER (DUE).
- **Dues** (home → 💰): who owes how much. Open a customer to see their statement and **Receive payment**
  (any amount — applied to the oldest unpaid bills first; Cash / UPI / Other). Payments can be deleted if entered by mistake.
- Bills completed before v2.1 count as paid.

## Adding new products while billing (v2.2)

- On the Add item screen: **＋ NEW PRODUCT** or **🎤 SPEAK NEW** (or search for a name that doesn't exist → "Add … as new product").
- Speak e.g. "thrust bearing 80 no. 365 rupees" → name, quantity, unit and price are filled in; check and tap ADD TO BILL.
  "no./nos/number/nag/pcs" = pieces, "kilo/kg" = kg, "total 1200" = total amount instead of price per unit, "scrap" = deduct.
- Only quantity and price are needed to bill. Missing unit (or price not saved to catalogue) → the product is **flagged red in Products**
  ("⚠ N products need details") until someone opens it, fills the gaps and taps Save.
- If a similar product already exists, it is suggested so you don't create duplicates.

## Data notes

- Each bill item stores the **product name, unit and rate at the moment it was added**, so price changes never alter existing bills.
- Bill items are stored separately inside the bill, so both phones can add items to the same bill at once without losing any.
- Offline changes are saved on the phone and upload automatically when the connection returns (badge on the home screen shows ☁ Synced / ⏳ Syncing / 📴 Offline).
- History shows the last 45 days automatically; tap **Load older bills** for earlier ones.
- **Import backup** and **Clear all data** affect the cloud and therefore **every phone**.

## Testing locally with the Firebase emulator

Open `http://localhost:8765/?emu` while the Firebase emulator (auth + firestore) is running;
a "Test sign-in" box lets you sign in as any test address.

## Adding a Bluetooth scale later

Implement an adapter `{ name, connected, read() → Promise<kg> }` and call `scale.use(adapter)`
(see `js/scale.js`). The weight entry screen then shows a "Read from scale" button automatically.
