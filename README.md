# ALFM GFunds Tracker

ALFM GFunds Tracker is an offline-first **Progressive Web App (PWA)** built to track the **ALFM Global Multi-Asset Income Fund (PHP)** via GCash GFunds. It allows you to paste GFunds updates, log deposits and dividends, and automatically generate a detailed breakdown, timeline, charts, and insights—similar to professional investment tracking platforms.

This project was built for **personal investment tracking**, transparency, and learning.

---

## ✨ Key Features

* 📋 **Paste & Parse GCash GFunds updates**

  * Automatically extracts:

    * NAVPU
    * Total units
    * Total investment value
    * 1-year return
    * “As of” date
    * Pending buy/sell orders

* 💰 **Deposit tracking**

  * Log top-ups with date and notes

* 💸 **Dividend tracking**

  * Supports **cash payout** and **reinvestment**
  * Optional NAVPU override for accurate reinvest calculations

* 🧠 **Automatic analysis**

  * Detects:

    * Market movement
    * Deposit execution
    * Dividend reinvestment
    * Cash dividend payout

* 📈 **Visual charts**

  * NAVPU over time
  * Total value over time
  * Units over time

* 🕒 **Timeline view**

  * Chronological history of snapshots, deposits, and dividends

* 📑 **Sortable table**

  * Full snapshot history with auto-generated analysis notes

* 📦 **Export / Import**

  * JSON (full backup)
  * CSV (snapshots only)

* 🔒 **Offline & private**

  * Data stored locally in your browser (localStorage)
  * No accounts, no servers, no tracking

* 📱 **Installable PWA**

  * Works offline
  * Add to Home Screen on Android like a native app

---

## 🖼️ Screenshots

> 📌 *Add screenshots here once deployed (optional but recommended)*

```
/screenshots
  ├── dashboard.png
  ├── timeline.png
  ├── charts.png
  └── table.png
```

Example section you can enable later:

```md
### Dashboard
![Dashboard](screenshots/dashboard.png)

### Timeline
![Timeline](screenshots/timeline.png)
```

---

## 🚀 Getting Started

### ▶ Run locally

1. Download or clone this repository
2. Open `index.html` in a modern browser (Chrome recommended)

No build tools, no dependencies.

---

### 🌐 Deploy on GitHub Pages

1. Upload all files to a GitHub repository
2. Go to **Settings → Pages**
3. Set source to:

   * Branch: `main`
   * Folder: `/ (root)`
4. Save and open the generated GitHub Pages URL

---

## 📲 Install as an App (PWA)

1. Open the app URL in **Chrome on Android**
2. Tap **⋮ Menu → Add to Home screen**
3. Launch it like a native app

> ℹ️ For PWA install to work, the app must be served over **HTTPS** (GitHub Pages is perfect).

---

## 📝 How to Use

1. Copy text from **GCash GFunds**
2. Paste it into the app and click **Parse & Save Snapshot**
3. Add:

   * Deposits when you top up
   * Dividends when income is received
4. Review:

   * Dashboard KPIs
   * Timeline explanations
   * Charts and breakdowns

The app uses the **“as of” date** inside your pasted text to ensure accurate historical tracking.

---

## ❓ FAQ

### Is this connected to GCash or BPI?

No. This app is **not connected** to GCash, BPI, or any financial institution.
All data is manually pasted by the user.

---

### Where is my data stored?

All data is stored **locally in your browser** using `localStorage`.
Nothing is uploaded or shared.

---

### Can I track multiple funds?

No. This version is intentionally designed for **ALFM Global Multi-Asset Income Fund (PHP) only** to keep parsing and analysis accurate.

---

### Does this calculate my true profit/loss?

It provides:

* Value changes
* Deposits
* Dividends (cash + reinvest)

You can infer performance, but it is **not a tax or official performance report**.

---

### Is this financial advice?

No. This is a **personal tracking and visualization tool only**.

---

## ⚠️ Limitations

* ALFM fund only
* PHP currency only
* Manual input required
* Local storage only (export regularly for backups)

---

## 🧑‍💻 Motivation

This project was created to:

* Better understand personal investment performance
* Track income-focused funds transparently
* Learn how market movement, deposits, and dividends interact over time

---

## 📄 License

MIT License
Free to use, modify, and share.

