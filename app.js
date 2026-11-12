/* My Cycling Journey - Complete App Logic
 * Offline-first PWA with GPS tracking
 */
'use strict';

const App = (() => {

  // ---------- STATE ----------
  const STORAGE_KEY = 'cycling_journey_v1';
  const DEFAULT_DATA = {
    profile: {
      name: 'Srinivasan',
      exercise: 'Outdoor cycling',
      bicycle: 'Gear cycle',
      preferredTime: '06:00-07:00',
      goal: 'Weight loss and fitness',
      startWeight: 75,
      currentWeight: 75,
      targetWeight: 65,
      height: 170,
      createdAt: Date.now()
    },
    programme: { w1: 15, w2: 20, w3: 25, w4: 30, daysPerWeek: 5, startDate: null },
    rides: [],
    weights: [],
    water: {},
    waterTarget: 2500,
    recovery: {},
    gratitude: [],
    badges: {},
    settings: { theme: 'light', gpsAccuracyLimit: 30 }
  };

  let data = loadData();
  let currentView = 'home';
  let weekChart = null, progressChart = null, weightChart = null;
  let pendingRide = null;
  let selectedRideId = null;

  // GPS ride state
  let ride = null;
  let watchId = null;
  let tickInterval = null;
  let map = null, routeLine = null, startMarker = null, liveMarker = null;
  let historyMap = null;

  // Manual timer state
  let manualRide = null;
  let manualInterval = null;

  // ---------- STORAGE ----------
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      return deepMerge(structuredClone(DEFAULT_DATA), parsed);
    } catch (e) {
      console.error('Load failed, using defaults:', e);
      return structuredClone(DEFAULT_DATA);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      toast('⚠️ Save failed — storage may be full.', 'error');
    }
  }

  function deepMerge(target, source) {
    for (const k of Object.keys(source)) {
      if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
        target[k] = deepMerge(target[k] || {}, source[k]);
      } else if (source[k] !== undefined) {
        target[k] = source[k];
      }
    }
    return target;
  }

  // ---------- UTIL ----------
  function todayKey(d = new Date()) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function fmtMs(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${pad(m)}:${pad(s)}`;
  }
  function fmtDateIN(ts) {
    try {
      return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    } catch { return new Date(ts).toLocaleString(); }
  }
  function fmtDateOnlyIN(ts) {
    try {
      return new Date(ts).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return new Date(ts).toLocaleDateString(); }
  }

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 8); }

  // Haversine distance between two GPS points, in km
  function haversine(a, b) {
    const R = 6371;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- VIEW SWITCHING ----------
  function switchView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === name);
    });
    window.scrollTo(0, 0);
    renderView(name);
  }

  function renderView(name) {
    if (name === 'home') renderHome();
    else if (name === 'cycling') renderCycling();
    else if (name === 'progress') renderProgress();
    else if (name === 'health') renderHealth();
    else if (name === 'settings') renderSettings();
  }

  // ---------- HOME ----------
  function renderHome() {
    const now = new Date();
    const hour = now.getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('greeting').textContent = `${greet}, ${data.profile.name}`;
    document.getElementById('header-date').textContent = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' });

    const target = currentTargetMinutes();
    const todayMin = minutesOnDate(todayKey());
    const pct = Math.min(100, Math.round((todayMin / target) * 100));
    document.getElementById('today-target').textContent = target;
    document.getElementById('today-done').textContent = todayMin;
    document.getElementById('today-pct').textContent = pct + '%';
    const ring = document.getElementById('today-ring');
    const circumference = 2 * Math.PI * 42;
    ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;

    const weekMin = currentWeekMinutes();
    document.getElementById('week-minutes').textContent = weekMin;
    document.getElementById('total-sessions').textContent = data.rides.length;
    const totalDist = data.rides.reduce((s, r) => s + (r.distance || 0), 0);
    document.getElementById('total-distance').textContent = totalDist.toFixed(1);

    // Weight
    const w = data.profile.currentWeight;
    document.getElementById('current-weight-display').textContent = w ? w.toFixed(1) : '--';
    const change = w - data.profile.startWeight;
    document.getElementById('weight-change-display').textContent = (change >= 0 ? '+' : '') + change.toFixed(1) + ' kg';

    // Streak
    const streak = calcStreak();
    document.getElementById('streak-days').textContent = streak;

    // Milestone
    renderMilestone();

    // Weekly chart
    renderWeekChart();

    // Quote
    document.getElementById('daily-quote').textContent = dailyQuote();
  }

  function dailyQuote() {
    const quotes = [
      'The journey of a thousand kilometres begins with a single pedal stroke.',
      'Every ride makes you stronger than yesterday.',
      'Consistency beats intensity. Show up today.',
      'Your only competition is who you were yesterday.',
      'Small wins compound. One ride at a time, Srinivasan.',
      'Discipline is the bridge between goals and fitness.',
      'Progress, not perfection. Keep pedalling.',
      'A healthy body carries a focused mind.',
      'The hardest part is clipping in. You\'ve already done that.',
      'Your future self is cheering for this ride.'
    ];
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return quotes[dayOfYear % quotes.length];
  }

  function renderMilestone() {
    const total = data.rides.length;
    const totalMin = data.rides.reduce((s, r) => s + (r.durationMin || 0), 0);
    const totalDist = data.rides.reduce((s, r) => s + (r.distance || 0), 0);

    const milestones = [
      { name: 'First Ride', target: 1, got: total, type: 'sessions' },
      { name: '5 Sessions', target: 5, got: total, type: 'sessions' },
      { name: '10 Sessions', target: 10, got: total, type: 'sessions' },
      { name: '100 Minutes', target: 100, got: totalMin, type: 'minutes' },
      { name: 'First 10 km', target: 10, got: totalDist, type: 'km' },
      { name: '25 Sessions', target: 25, got: total, type: 'sessions' },
      { name: '50 km Total', target: 50, got: totalDist, type: 'km' }
    ];
    const next = milestones.find(m => m.got < m.target) || milestones[milestones.length - 1];
    document.getElementById('milestone-text').textContent = next.name;
    document.getElementById('milestone-progress').textContent = `${Math.min(next.got, next.target).toFixed(next.type === 'km' ? 1 : 0)} / ${next.target}`;
    const pct = Math.min(100, (next.got / next.target) * 100);
    document.getElementById('milestone-fill').style.width = pct + '%';
  }

  function renderWeekChart() {
    const ctx = document.getElementById('week-chart');
    if (!ctx) return;
    const labels = [];
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' }));
      values.push(minutesOnDate(todayKey(d)));
    }
    if (weekChart) weekChart.destroy();
    if (typeof Chart === 'undefined') { ctx.parentElement.innerHTML = '<div class="text-muted">Chart library not loaded.</div>'; return; }
    weekChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: '#16a34a',
          borderRadius: 6,
          maxBarThickness: 36
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  // ---------- CYCLING COMPUTATIONS ----------
  function currentWeekNumber() {
    if (!data.programme.startDate) {
      data.programme.startDate = Date.now();
      saveData();
    }
    const diffDays = Math.floor((Date.now() - data.programme.startDate) / 86400000);
    const week = Math.min(4, Math.floor(diffDays / 7) + 1);
    return week;
  }

  function currentTargetMinutes() {
    // Safety: never auto-increase if latest recovery shows pain
    const latestPain = latestRecoveryPain();
    const w = currentWeekNumber();
    const safeWeek = latestPain === 'mod' || latestPain === 'severe' ? Math.max(1, w - 1) : w;
    const key = 'w' + safeWeek;
    return data.programme[key] || data.programme.w1 || 15;
  }

  function latestRecoveryPain() {
    const keys = Object.keys(data.recovery).sort().reverse();
    if (!keys.length) return 'none';
    return data.recovery[keys[0]].pain || 'none';
  }

  function minutesOnDate(key) {
    return data.rides
      .filter(r => todayKey(new Date(r.startTime)) === key)
      .reduce((s, r) => s + (r.durationMin || 0), 0);
  }

  function currentWeekMinutes() {
    const now = new Date();
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return data.rides
      .filter(r => new Date(r.startTime) >= start)
      .reduce((s, r) => s + (r.durationMin || 0), 0);
  }

  function calcStreak() {
    const dates = new Set(data.rides.map(r => todayKey(new Date(r.startTime))));
    if (!dates.size) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (dates.has(todayKey(d))) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  // ---------- CYCLING VIEW ----------
  function renderCycling() {
    if (ride && ride.active) {
      document.getElementById('cycling-idle').classList.add('hidden');
      document.getElementById('cycling-active').classList.remove('hidden');
      document.getElementById('manual-active').classList.add('hidden');
      updateLiveStats();
      return;
    }
    if (manualRide && manualRide.active) {
      document.getElementById('cycling-idle').classList.add('hidden');
      document.getElementById('cycling-active').classList.add('hidden');
      document.getElementById('manual-active').classList.remove('hidden');
      return;
    }
    document.getElementById('cycling-idle').classList.remove('hidden');
    document.getElementById('cycling-active').classList.add('hidden');
    document.getElementById('manual-active').classList.add('hidden');

    document.getElementById('target-display').textContent = currentTargetMinutes() + ' minutes';
    document.getElementById('week-info').textContent = `Week ${currentWeekNumber()} of 4-week programme`;

    renderRecentRides();
  }

  function renderRecentRides() {
    const container = document.getElementById('recent-rides-list');
    const recent = [...data.rides].sort((a, b) => b.startTime - a.startTime).slice(0, 5);
    if (!recent.length) {
      container.innerHTML = '<div class="empty"><span class="emoji">🚴</span>No rides yet. Your first ride is one tap away.</div>';
      return;
    }
    container.innerHTML = recent.map(r => `
      <div class="list-item" onclick="App.openRideDetail('${r.id}')" style="cursor:pointer">
        <div class="main">
          <div class="title">${fmtDateOnlyIN(r.startTime)} ${r.hasGps ? '📍' : '⌨️'}</div>
          <div class="meta">${r.durationMin} min · ${(r.distance || 0).toFixed(2)} km${r.avgSpeed ? ' · ' + r.avgSpeed.toFixed(1) + ' km/h' : ''}</div>
        </div>
        <div class="actions">
          <button class="icon-btn" onclick="event.stopPropagation(); App.openRideDetail('${r.id}')">👁️</button>
        </div>
      </div>
    `).join('');
  }

  // ---------- GPS RIDE ----------
  async function startGpsRide() {
    if (!navigator.geolocation) {
      toast('⚠️ Geolocation is not supported by this browser.', 'error');
      return;
    }

    // Prime a permission prompt with a single getCurrentPosition call
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });
    } catch (err) {
      if (err.code === 1) toast('❌ Location permission denied. Please enable it to track rides.', 'error');
      else if (err.code === 2) toast('❌ GPS unavailable. Check your device settings.', 'error');
      else toast('❌ GPS request timed out. Try again outdoors.', 'error');
      return;
    }

    ride = {
      id: uid(),
      active: true,
      paused: false,
      startTime: Date.now(),
      elapsedMs: 0,
      movingMs: 0,
      lastTick: Date.now(),
      lastPointTime: null,
      points: [],
      distanceKm: 0,
      maxSpeedKmh: 0,
      currentSpeedKmh: 0,
      accuracy: null,
      lastValidPos: null,
      signalLost: false,
      elevationGainM: 0,
      lastAltitude: null
    };

    renderCycling();
    initMap();
    startWatch();
    startTick();
    toast('🚴 Ride started! Stay safe.');
  }

  function startWatch() {
    try {
      watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000
      });
    } catch (e) {
      toast('⚠️ Could not start GPS watch.', 'error');
    }
  }

  function onPos(pos) {
    if (!ride || !ride.active || ride.paused) return;
    const { latitude, longitude, altitude, accuracy, speed } = pos.coords;
    const now = pos.timestamp || Date.now();

    ride.accuracy = accuracy;
    ride.signalLost = false;
    updateGpsStatus();

    // Filter inaccurate points
    const limit = data.settings.gpsAccuracyLimit || 30;
    if (accuracy > limit) return;

    const p = { lat: latitude, lng: longitude, alt: altitude, acc: accuracy, t: now };

    if (ride.lastValidPos) {
      const segDist = haversine(ride.lastValidPos, p); // km
      const dtSec = (now - ride.lastValidPos.t) / 1000;
      if (dtSec > 0 && segDist > 0) {
        const segSpeed = (segDist / dtSec) * 3600; // km/h
        // Reject unrealistic jumps (> 80 km/h for cycling)
        if (segSpeed > 80) return;
        // Reject noise when effectively stationary (<0.5 km/h) by not adding tiny jitter
        if (segSpeed < 1.5 && segDist < 0.005) {
          // treat as stationary; still refresh position but don't add distance
          ride.lastValidPos = p;
          ride.points.push(p);
          return;
        }
        ride.distanceKm += segDist;
        ride.currentSpeedKmh = segSpeed;
        if (segSpeed > ride.maxSpeedKmh) ride.maxSpeedKmh = segSpeed;

        // Elevation
        if (altitude != null && ride.lastAltitude != null) {
          const dAlt = altitude - ride.lastAltitude;
          if (dAlt > 0 && dAlt < 20 && accuracy < 20) ride.elevationGainM += dAlt;
        }
      }
    } else {
      // first valid point
      if (startMarker) startMarker.setLatLng([latitude, longitude]);
      else if (map) startMarker = L.marker([latitude, longitude]).addTo(map).bindPopup('Start').openPopup();
      if (map) map.setView([latitude, longitude], 16);
    }

    if (altitude != null) ride.lastAltitude = altitude;
    ride.lastValidPos = p;
    ride.points.push(p);
    updateMapTrail(p);
    updateLiveStats();
  }

  function onPosErr(err) {
    if (!ride) return;
    ride.signalLost = true;
    updateGpsStatus();
    console.warn('GPS error', err);
  }

  function updateGpsStatus() {
    const el = document.getElementById('live-gps-text');
    const container = el?.parentElement;
    if (!el || !container) return;
    container.className = 'gps-status';
    if (ride?.signalLost) {
      container.classList.add('bad');
      el.textContent = 'GPS signal lost — recording paused until signal returns.';
    } else if (ride?.accuracy == null) {
      container.classList.add('warn');
      el.textContent = 'Acquiring GPS…';
    } else if (ride.accuracy > (data.settings.gpsAccuracyLimit || 30)) {
      container.classList.add('warn');
      el.textContent = `Weak GPS (${Math.round(ride.accuracy)} m accuracy) — ignoring low-quality points.`;
    } else {
      container.classList.add('good');
      el.textContent = `GPS good — ${Math.round(ride.accuracy)} m accuracy · ${ride.points.length} points`;
    }
  }

  function startTick() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      if (!ride || !ride.active) return;
      const now = Date.now();
      const dt = now - ride.lastTick;
      ride.lastTick = now;
      ride.elapsedMs += dt;
      if (!ride.paused) ride.movingMs += dt;
      updateLiveStats();
    }, 1000);
  }

  function updateLiveStats() {
    if (!ride) return;
    const seconds = Math.floor(ride.movingMs / 1000);
    const hours = ride.movingMs / 3600000;
    const avg = hours > 0 ? ride.distanceKm / hours : 0;
    const speed = ride.paused ? 0 : (ride.currentSpeedKmh || 0);

    document.getElementById('live-speed').textContent = speed.toFixed(1);
    document.getElementById('live-distance').textContent = ride.distanceKm.toFixed(2);
    document.getElementById('live-duration').textContent = fmtDuration(seconds);
    document.getElementById('live-avg').textContent = avg.toFixed(1);
    document.getElementById('live-max').textContent = ride.maxSpeedKmh.toFixed(1);
  }

  function pauseRide() {
    if (!ride) return;
    ride.paused = true;
    ride.currentSpeedKmh = 0;
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('resume-btn').classList.remove('hidden');
    toast('⏸️ Paused');
  }

  function resumeRide() {
    if (!ride) return;
    ride.paused = false;
    ride.lastTick = Date.now();
    ride.lastValidPos = null; // avoid big jump across pause
    document.getElementById('pause-btn').classList.remove('hidden');
    document.getElementById('resume-btn').classList.add('hidden');
    toast('▶️ Resumed');
  }

  function stopRide() {
    if (!ride) return;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    if (tickInterval) clearInterval(tickInterval);
    watchId = null;
    tickInterval = null;

    pendingRide = {
      id: ride.id,
      startTime: ride.startTime,
      endTime: Date.now(),
      durationMin: Math.round(ride.movingMs / 60000),
      elapsedMin: Math.round(ride.elapsedMs / 60000),
      distance: parseFloat(ride.distanceKm.toFixed(3)),
      avgSpeed: ride.movingMs > 0 ? parseFloat((ride.distanceKm / (ride.movingMs / 3600000)).toFixed(2)) : 0,
      maxSpeed: parseFloat(ride.maxSpeedKmh.toFixed(2)),
      points: ride.points,
      elevationGain: Math.round(ride.elevationGainM),
      hasGps: true
    };

    ride = null;
    openSaveModal(true);
  }

  function initMap() {
    if (typeof L === 'undefined') {
      toast('⚠️ Map library unavailable — ride will still be tracked.', 'error');
      return;
    }
    if (map) { map.remove(); map = null; }
    map = L.map('map').setView([10.3673, 77.9803], 15); // Dindigul default
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);
    routeLine = L.polyline([], { color: '#16a34a', weight: 5, opacity: .85 }).addTo(map);
    setTimeout(() => map && map.invalidateSize(), 200);
  }

  function updateMapTrail(p) {
    if (!map || !routeLine) return;
    routeLine.addLatLng([p.lat, p.lng]);
    if (liveMarker) liveMarker.setLatLng([p.lat, p.lng]);
    else liveMarker = L.circleMarker([p.lat, p.lng], { radius: 7, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1 }).addTo(map);
    map.setView([p.lat, p.lng]);
  }

  // ---------- MANUAL RIDE ----------
  function startManualRide() {
    manualRide = { id: uid(), active: true, paused: false, startTime: Date.now(), elapsedMs: 0, movingMs: 0, lastTick: Date.now() };
    renderCycling();
    if (manualInterval) clearInterval(manualInterval);
    manualInterval = setInterval(() => {
      if (!manualRide || !manualRide.active) return;
      const now = Date.now();
      const dt = now - manualRide.lastTick;
      manualRide.lastTick = now;
      manualRide.elapsedMs += dt;
      if (!manualRide.paused) manualRide.movingMs += dt;
      document.getElementById('manual-duration').textContent = fmtMs(manualRide.movingMs);
    }, 500);
    toast('▶️ Manual timer started');
  }

  function pauseManual() {
    if (!manualRide) return;
    manualRide.paused = true;
    document.getElementById('manual-pause-btn').classList.add('hidden');
    document.getElementById('manual-resume-btn').classList.remove('hidden');
  }
  function resumeManual() {
    if (!manualRide) return;
    manualRide.paused = false;
    manualRide.lastTick = Date.now();
    document.getElementById('manual-pause-btn').classList.remove('hidden');
    document.getElementById('manual-resume-btn').classList.add('hidden');
  }
  function stopManual() {
    if (!manualRide) return;
    if (manualInterval) clearInterval(manualInterval);
    pendingRide = {
      id: manualRide.id,
      startTime: manualRide.startTime,
      endTime: Date.now(),
      durationMin: Math.max(1, Math.round(manualRide.movingMs / 60000)),
      elapsedMin: Math.round(manualRide.elapsedMs / 60000),
      distance: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      points: [],
      hasGps: false
    };
    manualRide = null;
    openSaveModal(false);
  }

  // ---------- SAVE MODAL ----------
  function openSaveModal(hasGps) {
    document.getElementById('save-modal').classList.remove('hidden');
    document.getElementById('distance-input-row').classList.toggle('hidden', hasGps);
    if (hasGps) document.getElementById('save-distance').value = pendingRide.distance || 0;
    else document.getElementById('save-distance').value = '';
    document.getElementById('save-notes').value = '';
    document.querySelectorAll('#save-effort-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.val === 'easy'));
    document.querySelectorAll('#save-pain-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.val === 'none'));
  }

  function cancelSave() {
    pendingRide = null;
    document.getElementById('save-modal').classList.add('hidden');
    renderCycling();
  }

  function confirmSave() {
    if (!pendingRide) return;
    // Duplicate check
    const dupe = data.rides.find(r => Math.abs(r.startTime - pendingRide.startTime) < 60000);
    if (dupe) {
      if (!confirm('A very similar ride exists. Save anyway?')) return;
    }

    const effort = document.querySelector('#save-effort-pills .pill.active')?.dataset.val || 'easy';
    const pain = document.querySelector('#save-pain-pills .pill.active')?.dataset.val || 'none';
    const distanceInput = parseFloat(document.getElementById('save-distance').value) || 0;
    const notes = document.getElementById('save-notes').value.trim();

    const finalRide = {
      ...pendingRide,
      distance: pendingRide.hasGps ? pendingRide.distance : distanceInput,
      avgSpeed: pendingRide.hasGps ? pendingRide.avgSpeed : (distanceInput > 0 && pendingRide.durationMin > 0 ? parseFloat((distanceInput / (pendingRide.durationMin / 60)).toFixed(2)) : 0),
      effort,
      pain,
      notes,
      calories: estimateCalories(pendingRide.durationMin, effort)
    };

    data.rides.push(finalRide);
    saveData();
    checkBadges();

    // If pain reported, show safety warning
    if (pain === 'mod') toast('⚠️ Take rest if needed. Don\'t push through pain.', 'error');

    pendingRide = null;
    document.getElementById('save-modal').classList.add('hidden');
    renderCycling();
    toast('✅ Ride saved!');
  }

  function estimateCalories(minutes, effort) {
    const w = data.profile.currentWeight || 70;
    const met = effort === 'hard' ? 9 : effort === 'moderate' ? 6.8 : 4;
    return Math.round((met * w * minutes) / 60);
  }

  // ---------- BADGES ----------
  function checkBadges() {
    const total = data.rides.length;
    const totalMin = data.rides.reduce((s, r) => s + (r.durationMin || 0), 0);
    const totalDist = data.rides.reduce((s, r) => s + (r.distance || 0), 0);
    const streak = calcStreak();

    const checks = [
      ['first-ride', total >= 1],
      ['5-sessions', total >= 5],
      ['10-sessions', total >= 10],
      ['100-minutes', totalMin >= 100],
      ['first-10km', totalDist >= 10],
      ['7-day-streak', streak >= 7]
    ];
    checks.forEach(([key, got]) => {
      if (got && !data.badges[key]) {
        data.badges[key] = Date.now();
        toast('🏆 Badge unlocked: ' + badgeName(key));
      }
    });
    saveData();
  }

  function badgeName(key) {
    const map = {
      'first-ride': 'First Ride',
      '5-sessions': '5 Sessions',
      '10-sessions': '10 Sessions',
      '100-minutes': '100 Minutes',
      'first-10km': 'First 10 km',
      '7-day-streak': '7-Day Streak'
    };
    return map[key] || key;
  }

  function badgeEmoji(key) {
    const map = {
      'first-ride': '🚴', '5-sessions': '⭐', '10-sessions': '🌟',
      '100-minutes': '⏱️', 'first-10km': '🏁', '7-day-streak': '🔥'
    };
    return map[key] || '🏆';
  }

  // ---------- PROGRESS ----------
  let currentPeriod = 'week';
  function renderProgress() {
    const period = currentPeriod;
    const now = new Date();
    let filterFrom;
    if (period === 'week') {
      const d = new Date(now);
      const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      filterFrom = d.getTime();
    } else if (period === 'month') {
      filterFrom = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else {
      filterFrom = 0;
    }
    const rides = data.rides.filter(r => r.startTime >= filterFrom);

    document.getElementById('rp-sessions').textContent = rides.length;
    document.getElementById('rp-duration').textContent = rides.reduce((s, r) => s + (r.durationMin || 0), 0);
    document.getElementById('rp-distance').textContent = rides.reduce((s, r) => s + (r.distance || 0), 0).toFixed(1);
    const avg = rides.filter(r => r.avgSpeed > 0);
    document.getElementById('rp-avg').textContent = avg.length ? (avg.reduce((s, r) => s + r.avgSpeed, 0) / avg.length).toFixed(1) : '0.0';

    // Chart
    const ctx = document.getElementById('progress-chart');
    if (ctx && typeof Chart !== 'undefined') {
      const labels = [], values = [];
      const days = period === 'week' ? 7 : period === 'month' ? 30 : Math.min(60, Math.max(14, data.rides.length * 2));
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }));
        values.push(minutesOnDate(todayKey(d)));
      }
      if (progressChart) progressChart.destroy();
      progressChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data: values, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.15)', fill: true, tension: .3, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }

    // Weight chart
    const wctx = document.getElementById('weight-chart');
    if (wctx && typeof Chart !== 'undefined') {
      const wlabels = data.weights.map(w => fmtDateOnlyIN(w.date));
      const wvalues = data.weights.map(w => w.weight);
      if (weightChart) weightChart.destroy();
      weightChart = new Chart(wctx, {
        type: 'line',
        data: {
          labels: wlabels.length ? wlabels : ['Start'],
          datasets: [
            { label: 'Weight', data: wvalues.length ? wvalues : [data.profile.startWeight], borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.1)', fill: true, tension: .3 },
            { label: 'Target', data: new Array(Math.max(1, wlabels.length)).fill(data.profile.targetWeight), borderColor: '#ef4444', borderDash: [5, 5], pointRadius: 0, fill: false }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
      });
    }

    // Consistency
    const weekTarget = data.programme.daysPerWeek || 5;
    const weekRides = data.rides.filter(r => {
      const d = new Date(r.startTime);
      const now2 = new Date();
      const day = now2.getDay() === 0 ? 6 : now2.getDay() - 1;
      const start = new Date(now2); start.setDate(now2.getDate() - day); start.setHours(0,0,0,0);
      return d >= start;
    });
    const uniqueDays = new Set(weekRides.map(r => todayKey(new Date(r.startTime)))).size;
    document.getElementById('consistency-week').textContent = `${uniqueDays} / ${weekTarget}`;
    document.getElementById('consistency-fill').style.width = Math.min(100, (uniqueDays / weekTarget) * 100) + '%';

    // History
    const list = document.getElementById('ride-history-list');
    const sorted = [...data.rides].sort((a, b) => b.startTime - a.startTime);
    if (!sorted.length) {
      list.innerHTML = '<div class="empty">No rides yet.</div>';
    } else {
      list.innerHTML = sorted.map(r => `
        <div class="list-item" onclick="App.openRideDetail('${r.id}')" style="cursor:pointer">
          <div class="main">
            <div class="title">${fmtDateOnlyIN(r.startTime)} ${r.hasGps ? '📍' : '⌨️'}</div>
            <div class="meta">${r.durationMin} min · ${(r.distance || 0).toFixed(2)} km${r.avgSpeed ? ' · ' + r.avgSpeed.toFixed(1) + ' km/h' : ''}${r.calories ? ' · ' + r.calories + ' kcal' : ''}</div>
          </div>
        </div>
      `).join('');
    }
  }

  // ---------- RIDE DETAIL ----------
  function openRideDetail(id) {
    const ride = data.rides.find(r => r.id === id);
    if (!ride) return;
    selectedRideId = id;
    document.getElementById('rd-title').textContent = fmtDateIN(ride.startTime);
    document.getElementById('rd-body').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${ride.durationMin}</div><div class="stat-sub">min</div></div>
        <div class="stat-card"><div class="stat-label">Distance</div><div class="stat-value">${(ride.distance || 0).toFixed(2)}</div><div class="stat-sub">km</div></div>
        <div class="stat-card"><div class="stat-label">Avg Speed</div><div class="stat-value">${(ride.avgSpeed || 0).toFixed(1)}</div><div class="stat-sub">km/h</div></div>
        <div class="stat-card"><div class="stat-label">Max Speed</div><div class="stat-value">${(ride.maxSpeed || 0).toFixed(1)}</div><div class="stat-sub">km/h</div></div>
        <div class="stat-card"><div class="stat-label">Calories</div><div class="stat-value">${ride.calories || 0}</div><div class="stat-sub">kcal</div></div>
        <div class="stat-card"><div class="stat-label">Elevation</div><div class="stat-value">${ride.elevationGain || 0}</div><div class="stat-sub">m</div></div>
      </div>
      <div class="card mt-2">
        <div class="flex-between"><span>Effort</span><span>${ride.effort || '—'}</span></div>
        <div class="flex-between mt-2"><span>Pain</span><span>${ride.pain || '—'}</span></div>
        ${ride.notes ? `<div class="mt-2"><strong>Notes:</strong><br/>${escapeHtml(ride.notes)}</div>` : ''}
      </div>
    `;

    document.getElementById('ride-detail-modal').classList.remove('hidden');
    const mapEl = document.getElementById('history-map');
    if (ride.points && ride.points.length > 1 && typeof L !== 'undefined') {
      mapEl.classList.remove('hidden');
      setTimeout(() => {
        if (historyMap) { historyMap.remove(); historyMap = null; }
        historyMap = L.map('history-map');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(historyMap);
        const coords = ride.points.map(p => [p.lat, p.lng]);
        const line = L.polyline(coords, { color: '#16a34a', weight: 5 }).addTo(historyMap);
        L.marker(coords[0]).addTo(historyMap).bindPopup('Start');
        L.marker(coords[coords.length - 1]).addTo(historyMap).bindPopup('End');
        historyMap.fitBounds(line.getBounds(), { padding: [20, 20] });
      }, 100);
    } else {
      mapEl.classList.add('hidden');
    }
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' })[c]); }

  function closeRideDetail() {
    document.getElementById('ride-detail-modal').classList.add('hidden');
    if (historyMap) { historyMap.remove(); historyMap = null; }
    selectedRideId = null;
  }

  function deleteSelectedRide() {
    if (!selectedRideId) return;
    if (!confirm('Delete this ride? This cannot be undone.')) return;
    data.rides = data.rides.filter(r => r.id !== selectedRideId);
    saveData();
    closeRideDetail();
    renderView(currentView);
    toast('🗑️ Ride deleted');
  }

  // ---------- HEALTH VIEW ----------
  function renderHealth() {
    renderWater();
    renderWeight();
    renderRecovery();
    renderGratitude();
  }

  function renderWater() {
    const key = todayKey();
    const today = data.water[key] || 0;
    const target = data.waterTarget || 2500;
    document.getElementById('water-done').textContent = today;
    document.getElementById('water-target').textContent = target;
    document.getElementById('water-target-input').value = target;
    const pct = Math.min(100, (today / target) * 100);
    const circumference = 2 * Math.PI * 42;
    document.getElementById('water-ring').style.strokeDashoffset = circumference - (pct / 100) * circumference;

    // Glasses
    const glassCount = Math.round(target / 250);
    const filledCount = Math.floor(today / 250);
    const container = document.getElementById('water-glasses');
    container.innerHTML = '';
    for (let i = 0; i < glassCount; i++) {
      const g = document.createElement('div');
      g.className = 'water-glass' + (i < filledCount ? ' full' : '');
      container.appendChild(g);
    }
  }

  function addWater(ml) {
    const key = todayKey();
    data.water[key] = (data.water[key] || 0) + ml;
    saveData();
    renderWater();
  }

  function addCustomWater() {
    const v = parseInt(prompt('How many ml?'), 10);
    if (v > 0 && v < 5000) addWater(v);
    else if (v) toast('⚠️ Please enter 1–4999 ml.', 'error');
  }

  function renderWeight() {
    const p = data.profile;
    document.getElementById('w-start').textContent = (p.startWeight || 0).toFixed(1);
    document.getElementById('w-current').textContent = (p.currentWeight || 0).toFixed(1);
    document.getElementById('w-target').textContent = (p.targetWeight || 0).toFixed(1);
    const change = (p.currentWeight || 0) - (p.startWeight || 0);
    document.getElementById('w-change').textContent = (change >= 0 ? '+' : '') + change.toFixed(1);

    if (p.height && p.currentWeight) {
      const hm = p.height / 100;
      const bmi = p.currentWeight / (hm * hm);
      document.getElementById('w-bmi').textContent = bmi.toFixed(1);
    }

    const list = document.getElementById('weight-history-list');
    if (!data.weights.length) {
      list.innerHTML = '<div class="empty">No entries yet.</div>';
    } else {
      list.innerHTML = [...data.weights].reverse().map(w => `
        <div class="list-item">
          <div class="main">
            <div class="title">${w.weight.toFixed(1)} kg</div>
            <div class="meta">${fmtDateOnlyIN(w.date)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  function logWeight() {
    const v = parseFloat(document.getElementById('log-weight').value);
    if (!v || v < 20 || v > 300) { toast('⚠️ Enter a valid weight (20–300 kg).', 'error'); return; }
    data.weights.push({ date: Date.now(), weight: v });
    data.profile.currentWeight = v;
    // Never auto-change target weight
    saveData();
    document.getElementById('log-weight').value = '';
    renderWeight();
    toast('⚖️ Weight logged');
  }

  function renderRecovery() {
    const today = data.recovery[todayKey()] || {};
    document.getElementById('r-sleep').value = today.sleep || '';
    document.getElementById('r-notes').value = today.notes || '';
    document.querySelectorAll('#r-energy-pills .pill').forEach(p => p.classList.toggle('active', +p.dataset.val === (today.energy || 0)));
    document.querySelectorAll('#r-soreness-pills .pill').forEach(p => p.classList.toggle('active', +p.dataset.val === (today.soreness || 0)));
    document.querySelectorAll('#r-pain-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.val === (today.pain || 'none')));
  }

  function saveRecovery() {
    const key = todayKey();
    const energy = parseInt(document.querySelector('#r-energy-pills .pill.active')?.dataset.val || '0', 10);
    const soreness = parseInt(document.querySelector('#r-soreness-pills .pill.active')?.dataset.val || '0', 10);
    const pain = document.querySelector('#r-pain-pills .pill.active')?.dataset.val || 'none';
    const sleep = parseFloat(document.getElementById('r-sleep').value) || 0;
    const notes = document.getElementById('r-notes').value.trim();

    data.recovery[key] = { energy, soreness, pain, sleep, notes, saved: Date.now() };
    saveData();

    if (pain === 'mod' || pain === 'severe') {
      toast('⚠️ Rest is important. Today\'s target reduced automatically.', 'error');
    } else {
      toast('✅ Check-in saved');
    }
  }

  function renderGratitude() {
    document.getElementById('gratitude-date').textContent = fmtDateOnlyIN(Date.now());
    const today = data.gratitude.find(g => todayKey(new Date(g.date)) === todayKey());
    document.getElementById('gratitude-text').value = today?.text || '';
    const list = document.getElementById('gratitude-list');
    if (!data.gratitude.length) {
      list.innerHTML = '<div class="empty">No entries yet.</div>';
    } else {
      list.innerHTML = [...data.gratitude].reverse().slice(0, 20).map(g => `
        <div class="list-item">
          <div class="main">
            <div class="title">${fmtDateOnlyIN(g.date)}</div>
            <div class="meta">${escapeHtml(g.text)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  function saveGratitude() {
    const text = document.getElementById('gratitude-text').value.trim();
    if (!text) { toast('⚠️ Please write something first.', 'error'); return; }
    const key = todayKey();
    const existing = data.gratitude.find(g => todayKey(new Date(g.date)) === key);
    if (existing) existing.text = text;
    else data.gratitude.push({ date: Date.now(), text });
    saveData();
    renderGratitude();
    toast('🙏 Saved');
  }

  // ---------- SETTINGS ----------
  function renderSettings() {
    document.getElementById('s-name').value = data.profile.name || '';
    document.getElementById('s-height').value = data.profile.height || '';
    document.getElementById('s-start-weight').value = data.profile.startWeight || '';
    document.getElementById('s-target-weight').value = data.profile.targetWeight || '';
    document.getElementById('s-w1').value = data.programme.w1;
    document.getElementById('s-w2').value = data.programme.w2;
    document.getElementById('s-w3').value = data.programme.w3;
    document.getElementById('s-w4').value = data.programme.w4;
    document.getElementById('s-days').value = data.programme.daysPerWeek;
    document.getElementById('s-gps-accuracy').value = data.settings.gpsAccuracyLimit || 30;

    // Badges
    const grid = document.getElementById('badges-grid');
    const badges = ['first-ride', '5-sessions', '10-sessions', '100-minutes', 'first-10km', '7-day-streak'];
    grid.innerHTML = badges.map(k => `
      <div class="badge ${data.badges[k] ? 'earned' : ''}">
        <div class="emoji">${badgeEmoji(k)}</div>
        <div class="name">${badgeName(k)}</div>
      </div>
    `).join('');
  }

  function saveProfile() {
    data.profile.name = document.getElementById('s-name').value.trim() || 'Srinivasan';
    data.profile.height = parseFloat(document.getElementById('s-height').value) || data.profile.height;
    const sw = parseFloat(document.getElementById('s-start-weight').value);
    const tw = parseFloat(document.getElementById('s-target-weight').value);
    if (sw && sw > 20 && sw < 300) {
      data.profile.startWeight = sw;
      if (!data.profile.currentWeight) data.profile.currentWeight = sw;
    }
    if (tw && tw > 20 && tw < 300) data.profile.targetWeight = tw;
    saveData();
    toast('✅ Profile saved');
    renderView(currentView);
  }

  function saveProgramme() {
    const w1 = parseInt(document.getElementById('s-w1').value, 10);
    const w2 = parseInt(document.getElementById('s-w2').value, 10);
    const w3 = parseInt(document.getElementById('s-w3').value, 10);
    const w4 = parseInt(document.getElementById('s-w4').value, 10);
    const d = parseInt(document.getElementById('s-days').value, 10);
    if ([w1, w2, w3, w4].some(v => !v || v < 5 || v > 180)) { toast('⚠️ Weekly targets must be 5–180 min.', 'error'); return; }
    if (!d || d < 1 || d > 7) { toast('⚠️ Days per week must be 1–7.', 'error'); return; }
    data.programme.w1 = w1; data.programme.w2 = w2; data.programme.w3 = w3; data.programme.w4 = w4;
    data.programme.daysPerWeek = d;
    saveData();
    toast('✅ Programme saved');
  }

  function saveGpsSettings() {
    const v = parseInt(document.getElementById('s-gps-accuracy').value, 10);
    if (!v || v < 5 || v > 100) { toast('⚠️ Accuracy must be 5–100 m.', 'error'); return; }
    data.settings.gpsAccuracyLimit = v;
    saveData();
    toast('✅ GPS settings saved');
  }

  // ---------- BACKUP ----------
  function exportJson() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    download(blob, `my-cycling-journey-backup-${todayKey()}.json`);
  }

  function exportCsv() {
    const rows = [['Date', 'Start Time', 'Duration (min)', 'Distance (km)', 'Avg Speed (km/h)', 'Max Speed (km/h)', 'Calories', 'Effort', 'Pain', 'Has GPS', 'Notes']];
    data.rides.forEach(r => {
      rows.push([
        fmtDateOnlyIN(r.startTime),
        new Date(r.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
        r.durationMin,
        (r.distance || 0).toFixed(2),
        (r.avgSpeed || 0).toFixed(2),
        (r.maxSpeed || 0).toFixed(2),
        r.calories || 0,
        r.effort || '',
        r.pain || '',
        r.hasGps ? 'Yes' : 'No',
        (r.notes || '').replace(/"/g, '""')
      ]);
    });
    const csv = rows.map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    download(blob, `cycling-rides-${todayKey()}.csv`);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function restoreJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported.profile) throw new Error('Not a valid backup');
        if (!confirm('This will replace all current data. Continue?')) return;
        data = deepMerge(structuredClone(DEFAULT_DATA), imported);
        saveData();
        renderView(currentView);
        toast('✅ Data restored');
      } catch (err) {
        toast('❌ Invalid backup file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function deleteGpsHistory() {
    if (!confirm('This removes stored GPS coordinates from all rides. Ride records will remain. Continue?')) return;
    data.rides.forEach(r => { r.points = []; });
    saveData();
    toast('🗑️ GPS history cleared');
  }

  function resetApp() {
    if (!confirm('This will delete ALL data permanently. Continue?')) return;
    if (!confirm('Really reset? There is no undo.')) return;
    localStorage.removeItem(STORAGE_KEY);
    data = structuredClone(DEFAULT_DATA);
    saveData();
    renderView(currentView);
    toast('✅ App reset');
  }

  // ---------- THEME ----------
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    data.settings.theme = next;
    saveData();
    document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
    // rerender charts to pick up colors
    renderView(currentView);
  }

  function applyTheme() {
    const theme = data.settings.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ---------- INIT ----------
  function init() {
    applyTheme();

    // Nav
    document.querySelectorAll('.nav-item').forEach(n => {
      n.addEventListener('click', () => switchView(n.dataset.view));
    });
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // GPS/Manual toggle
    document.querySelectorAll('#ride-type-toggle button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#ride-type-toggle button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById('gps-mode').classList.toggle('hidden', b.dataset.type !== 'gps');
        document.getElementById('manual-mode').classList.toggle('hidden', b.dataset.type !== 'manual');
      });
    });

    // Ride buttons
    document.getElementById('start-gps-btn').addEventListener('click', startGpsRide);
    document.getElementById('start-manual-btn').addEventListener('click', startManualRide);
    document.getElementById('pause-btn').addEventListener('click', pauseRide);
    document.getElementById('resume-btn').addEventListener('click', resumeRide);
    document.getElementById('stop-btn').addEventListener('click', () => {
      if (confirm('Finish and save this ride?')) stopRide();
    });
    document.getElementById('manual-pause-btn').addEventListener('click', pauseManual);
    document.getElementById('manual-resume-btn').addEventListener('click', resumeManual);
    document.getElementById('manual-stop-btn').addEventListener('click', () => {
      if (confirm('Finish and save this ride?')) stopManual();
    });

    // Progress period
    document.querySelectorAll('#report-period button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#report-period button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        currentPeriod = b.dataset.period;
        renderProgress();
      });
    });

    // Health tabs
    document.querySelectorAll('#health-tab button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#health-tab button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        ['water', 'weight', 'recovery', 'gratitude'].forEach(t => {
          document.getElementById('health-' + t).classList.toggle('hidden', t !== b.dataset.tab);
        });
      });
    });

    // Pill groups (modal, recovery)
    function bindPills(selector) {
      document.querySelectorAll(selector + ' .pill').forEach(p => {
        p.addEventListener('click', () => {
          p.parentElement.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
          p.classList.add('active');
        });
      });
    }
    bindPills('#save-effort-pills');
    bindPills('#save-pain-pills');
    bindPills('#r-energy-pills');
    bindPills('#r-soreness-pills');
    bindPills('#r-pain-pills');

    // Water target input
    document.getElementById('water-target-input').addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (v > 500 && v < 10000) { data.waterTarget = v; saveData(); renderWater(); toast('✅ Water target updated'); }
    });

    // Service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }

    // Visibility: re-sync timer when app comes back (timestamps are authoritative)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (ride) { ride.lastTick = Date.now(); updateLiveStats(); }
        if (manualRide) { manualRide.lastTick = Date.now(); }
      }
    });

    // Warn before leaving mid-ride
    window.addEventListener('beforeunload', (e) => {
      if ((ride && ride.active) || (manualRide && manualRide.active)) {
        e.preventDefault();
        e.returnValue = 'A ride is in progress. Leave anyway?';
      }
    });

    switchView('home');
  }

  // Public API
  return {
    init, switchView, addWater, addCustomWater, logWeight, saveRecovery, saveGratitude,
    saveProfile, saveProgramme, saveGpsSettings, exportJson, exportCsv, restoreJson,
    deleteGpsHistory, resetApp, openRideDetail, closeRideDetail, deleteSelectedRide,
    cancelSave, confirmSave
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
