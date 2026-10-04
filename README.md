# A One Enterprise — Billing & Weight Calculator (V1)

Offline-first PWA for counter billing. Plain HTML/CSS/JS, no build step, no dependencies.

## Put it on your phone

A PWA must be served over **HTTPS** (needed for offline mode, install and the microphone).
Any static host works. The easiest options:

- **Netlify Drop** — open https://app.netlify.com/drop and drag this whole folder onto the page. You get an `https://….netlify.app` link.
- **GitHub Pages** — push the folder to a repo, then Settings → Pages → deploy from branch.

Then on the phone: open the link in **Chrome** → ⋮ menu → **Add to Home screen / Install app**.
(iPhone: open in Safari → Share → Add to Home Screen.) After the first load it works fully offline.

## Updating the app later

Change the files, then bump `VERSION` in `sw.js` (e.g. `aone-v1.0.1`) and re-upload.
Phones get the new version the next time the app is opened twice (once to download, once to use it).

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `css/app.css` | All styling (mobile-first, large touch targets) |
| `js/app.js` | Screens, billing logic, routing |
| `js/db.js` | IndexedDB storage (products, customers, bills, settings) |
| `js/voice.js` | Speech-to-text for customer names, with keyboard fallback |
| `js/scale.js` | Weighing-machine adapter slot (manual entry in V1) |
| `sw.js` | Offline cache |
| `manifest.json`, `icons/` | Install / home-screen icon |

## Data notes

- Each bill stores its line items with the **product name, unit and rate at the moment they were added**, so price changes never alter existing bills.
- Every change is saved to IndexedDB immediately; open bills survive refresh or closing the browser.
- Data lives only on that phone. Use **Settings → Export backup** regularly. **Import backup** replaces all data on the phone with the backup file.
- Clearing Chrome's "site data" for the app's site deletes everything, so export a backup first.

## Adding a Bluetooth scale later

Implement an adapter `{ name, connected, read() → Promise<kg> }` and call `scale.use(adapter)`
(see `js/scale.js`). The weight entry screen then shows a "Read from scale" button automatically.
