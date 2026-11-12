# My Cycling Journey

A complete offline-first PWA for Srinivasan to track outdoor gear-cycling sessions with GPS, weight, water, health and motivation.

## Project Structure

```
my-cycling-journey/
├── index.html         Main app shell and all screens
├── style.css          Styles, light/dark theme
├── app.js             All application logic
├── manifest.json      PWA manifest
├── service-worker.js  Offline caching
├── icons/
│   ├── icon-192.png   App icon (192×192)
│   └── icon-512.png   App icon (512×512)
└── README.md          This file
```

## Features

- Dashboard with today's target, weekly chart, streak and milestones
- GPS cycling tracker (Leaflet + OpenStreetMap): live speed, distance, duration, avg/max speed, route polyline, start/end markers, accuracy filter, jump rejection, pause/resume
- Manual timer mode when GPS is unavailable
- Four-week programme: 15 → 20 → 25 → 30 minutes, 5 days/week (editable); auto-reduces target if recent recovery check-in reports moderate/severe pain
- Weight management: log, BMI, history, chart, change vs starting weight
- Water tracker: default 2.5 L target, +250/+500/custom, resets daily, editable target
- Health & Recovery: sleep, morning energy, soreness, knee/thigh discomfort, notes
- Gratitude journal: one entry per day
- Reports: week / month / all-time with CSV export
- Backup & restore via JSON
- Badges: First Ride, 5/10 Sessions, 100 Minutes, First 10 km, 7-Day Streak
- Daily motivational quotes
- Dark mode with persistence
- Five-tab bottom nav: Home · Cycling · Progress · Health · Settings
- IST dates and times, kg/km/min/ml units
- Privacy: delete all GPS route data in one tap
- Full offline operation after first load (service worker caches app + libraries)

---

## 1. Run the Application

### Easiest way (Windows/Android via USB)

1. Unzip or copy the `my-cycling-journey` folder anywhere on your device.
2. On a desktop: double-click `index.html` (works but service worker + install prompt need a web server).

### Recommended: run a tiny local server

Any of these from inside the `my-cycling-journey/` folder:

```bash
# Python (installed on most computers)
python3 -m http.server 8080

# Node.js
npx serve .
```

Then open **http://localhost:8080** in Chrome on your computer, or on your Android phone replace `localhost` with your computer's IP address (e.g. `http://192.168.1.5:8080`) — both devices must be on the same Wi-Fi.

### Host it permanently (free)

Upload all the files to:
- **GitHub Pages**: push to `srinivcet/my-cycling-journey`, enable Pages → main branch → root. You'll get `https://srinivcet.github.io/my-cycling-journey/`.
- **Netlify Drop**: drag the folder onto <https://app.netlify.com/drop> — done in seconds.

HTTPS is required for GPS to work on Android (`localhost` is also treated as secure).

---

## 2. Install on an Android Phone

1. Open the app's URL in **Chrome** on Android.
2. Tap the **⋮ menu → "Install app"** (or "Add to Home screen").
3. Confirm. An icon appears on your home screen — it launches full-screen like a native app.

If you want it packaged as a real APK: upload the hosted URL to **PWABuilder** (<https://www.pwabuilder.com/>), click **Android → Generate package** → sign with your keystore → sideload the APK on your phone.

---

## 3. Use It Without Internet

After the first launch (while online), the service worker caches everything needed:
- All HTML, CSS, JS files
- Chart.js and Leaflet libraries

From then on the app launches and runs fully offline. One caveat: **map tiles** from OpenStreetMap need internet the first time you view a given area. Tiles you've already viewed are cached and will work offline. GPS coordinates are always recorded regardless of network — your route is saved and shown on the map whenever tiles become available.

---

## 4. Back Up and Restore Data

**Export** (do this regularly):
- Go to **Settings → Backup & Restore**
- Tap **"📦 Export JSON"** — saves a full backup file to your Downloads
- Tap **"📊 Export CSV"** — saves all rides as a spreadsheet-friendly CSV

**Restore**:
- Go to **Settings → Backup & Restore**
- Tap **"📥 Restore from JSON"**
- Pick your backup file — confirm the overwrite prompt

Your data lives in your browser's LocalStorage, so clearing browser data or uninstalling the app will erase it. **Export monthly** to be safe.

---

## Notes on GPS Accuracy & Background Tracking

- The browser Geolocation API runs only while the page is in the foreground. If you lock your phone the browser will usually suspend GPS updates; the app continues the timer using timestamps but may miss route points during that gap. A warning banner appears if signal is lost.
- For truly reliable background GPS, a native Android app (Flutter + background location service, or Kotlin with a foreground service) is required. This PWA is designed for one-hour foreground rides with the screen on.
- Keep brightness low and use the phone's "keep screen on while charging" setting if possible.
- Points with accuracy worse than the threshold (default 30 m, editable in Settings) are rejected. Unrealistic jumps (>80 km/h) are rejected. Stationary jitter is suppressed.

---

## Safety

- Never cycle through sharp pain. The app auto-reduces your daily target if you log moderate/severe pain in Recovery.
- Don't operate your phone while riding — glance at stats only when stopped.
- Target weight is never changed automatically.

Built for Srinivasan · v1.0 · All rights reserved.
