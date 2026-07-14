/* Iron Log — 4-day split (Push/Pull/Legs/Full Body) + body-scan progress. */

const PLAN = {
  push: [
    { name: "Barbell Bench Press", sets: 4, reps: "6-8" },
    { name: "Incline Dumbbell Press", sets: 3, reps: "8-10" },
    { name: "Seated Overhead Press", sets: 3, reps: "8-10" },
    { name: "Lateral Raises", sets: 3, reps: "12-15" },
    { name: "Triceps Pushdown", sets: 3, reps: "12-15" },
    { name: "Cable Fly", sets: 3, reps: "10-12" },
  ],
  pull: [
    { name: "Seated Cable Row", sets: 3, reps: "8-10" },
    { name: "Pull-Ups / Lat Pulldown", sets: 4, reps: "8-10" },
    { name: "Barbell Row", sets: 3, reps: "8-10" },
    { name: "Face Pulls", sets: 3, reps: "15" },
    { name: "Barbell Curl", sets: 3, reps: "10-12" },
    { name: "Rear Delt Fly", sets: 3, reps: "12-15" },
  ],
  legs: [
    { name: "Back Squat", sets: 4, reps: "6-8" },
    { name: "Bulgarian Split Squat", sets: 3, reps: "8-10/leg" },
    { name: "Leg Press", sets: 3, reps: "10-12" },
    { name: "Leg Curl", sets: 3, reps: "12" },
    { name: "Walking Lunges", sets: 3, reps: "10/leg" },
    { name: "Calf Raises", sets: 4, reps: "15" },
  ],
  full: [
    { name: "Back Squat", sets: 3, reps: "8" },
    { name: "Bench Press", sets: 3, reps: "8" },
    { name: "Seated Overhead Press", sets: 3, reps: "8" },
    { name: "Dumbbell Curl", sets: 3, reps: "10-12" },
    { name: "Overhead Tricep Extension", sets: 3, reps: "10-12" },
    { name: "Plank", sets: 3, reps: "30-45s" },
  ],
  rest: [],
};

const DAY_LABEL = { push: "Push", pull: "Pull", legs: "Legs", full: "Full Body", rest: "Rest" };
// index 0 = Sunday ... 6 = Saturday
const WEEKDAY_SPLIT = ["rest", "push", "pull", "legs", "rest", "full", "rest"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_PROFILE = {
  startWeight: 175,
  startBF: 22.3,
  goalWeight: 160,
  goalBF: 15,
  tee: 2621,
  startDate: null, // set on first run
};

function isoDate(d) {
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0, 10);
}
function todayISO() {
  return isoDate(new Date());
}
function splitForDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAY_SPLIT[d.getDay()];
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const App = {
  profile: null,
  scans: [],
  workoutLog: {}, // { date: { dayType, exercises: { name: [{weight,reps,done}] } } }
  selectedWorkoutDate: todayISO(),

  async init() {
    this.profile = (await Storage.get("profile")) || { ...DEFAULT_PROFILE, startDate: todayISO() };
    this.scans = (await Storage.get("bodyscans")) || [];
    this.workoutLog = (await Storage.get("workoutlog")) || {};

    // Seed an initial scan from profile start stats so charts/goal math work day one.
    if (this.scans.length === 0) {
      this.scans.push({ date: this.profile.startDate, weight: this.profile.startWeight, bf: this.profile.startBF });
      await Storage.set("bodyscans", this.scans);
    }
    await Storage.set("profile", this.profile);

    this.bindNav();
    this.updateSyncBadge();
    this.renderAll();
  },

  bindNav() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.switchView(btn.dataset.view));
    });
  },

  switchView(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "progress") this.renderProgress();
  },

  updateSyncBadge() {
    const dot = document.getElementById("sync-dot");
    const label = document.getElementById("sync-label");
    if (Storage.isSynced) {
      dot.className = "sync-dot on";
      label.textContent = "Synced via Supabase";
    } else {
      dot.className = "sync-dot off";
      label.textContent = "Local storage only";
    }
  },

  renderAll() {
    const today = todayISO();
    document.getElementById("header-sub").textContent = fmtDate(today) + " · " + DAY_LABEL[splitForDate(today)] + " day";
    this.renderWorkoutWeek();
    this.renderWorkoutDay(this.selectedWorkoutDate);
    this.renderProgress();
    this.fillSettingsForm();
  },

  // ---------- WORKOUT ----------
  renderWorkoutWeek() {
    const grid = document.getElementById("week-grid");
    grid.innerHTML = "";
    const base = new Date();
    base.setDate(base.getDate() - base.getDay()); // Sunday of this week
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = isoDate(d);
      const dayType = WEEKDAY_SPLIT[i];
      const chip = document.createElement("div");
      chip.className = "day-chip" + (dateStr === this.selectedWorkoutDate ? " selected" : "");
      chip.innerHTML = `<div class="dow">${DOW_SHORT[i]}</div><div class="label pill ${dayType}" style="margin-top:4px;">${DAY_LABEL[dayType]}</div>`;
      chip.onclick = () => {
        this.selectedWorkoutDate = dateStr;
        this.renderWorkoutWeek();
        this.renderWorkoutDay(dateStr);
      };
      grid.appendChild(chip);
    }
  },

  getLastLog(exerciseName, beforeDate) {
    const dates = Object.keys(this.workoutLog).filter((d) => d < beforeDate).sort().reverse();
    for (const d of dates) {
      const ex = this.workoutLog[d].exercises?.[exerciseName];
      if (ex && ex.length) return ex;
    }
    return null;
  },

  renderWorkoutDay(dateStr) {
    const dayType = splitForDate(dateStr);
    const card = document.getElementById("workout-day-card");
    if (dayType === "rest") {
      card.innerHTML = `<h2>${fmtDate(dateStr)} <span class="pill rest">Rest</span></h2><p class="empty">No lifting scheduled.</p>`;
      return;
    }
    const exercises = PLAN[dayType];
    const dayLog = this.workoutLog[dateStr]?.exercises || {};

    let html = `<h2>${fmtDate(dateStr)} <span class="pill ${dayType}">${DAY_LABEL[dayType]}</span></h2>`;
    exercises.forEach((ex) => {
      const last = this.getLastLog(ex.name, dateStr);
      const logged = dayLog[ex.name] || [];
      html += `<div class="exercise" data-exercise="${ex.name}">
        <div class="name">${ex.name}</div>
        <div class="target">Target: ${ex.sets} x ${ex.reps}${last ? ` · last: ${last.map((s) => s.weight || "-").join("/")} lb` : ""}</div>
        <div class="set-rows">`;
      for (let s = 0; s < ex.sets; s++) {
        const prev = logged[s] || {};
        const suggestedWeight = prev.weight ?? last?.[s]?.weight ?? "";
        const suggestedReps = prev.reps ?? "";
        html += `<div class="set-row">
          <span class="set-num">#${s + 1}</span>
          <input type="number" placeholder="lb" value="${suggestedWeight}" data-role="weight" data-set="${s}">
          <span class="x">×</span>
          <input type="number" placeholder="reps" value="${suggestedReps}" data-role="reps" data-set="${s}">
          <input type="checkbox" data-role="done" data-set="${s}" ${prev.done ? "checked" : ""}>
        </div>`;
      }
      html += `</div></div>`;
    });
    html += `<button class="btn" style="margin-top:14px;" onclick="App.saveWorkout('${dateStr}')">Save workout</button>`;
    card.innerHTML = html;
  },

  async saveWorkout(dateStr) {
    const dayType = splitForDate(dateStr);
    const card = document.getElementById("workout-day-card");
    const exercises = {};
    card.querySelectorAll(".exercise").forEach((exEl) => {
      const name = exEl.dataset.exercise;
      const rows = [];
      exEl.querySelectorAll(".set-row").forEach((row) => {
        const weight = row.querySelector('[data-role="weight"]').value;
        const reps = row.querySelector('[data-role="reps"]').value;
        const done = row.querySelector('[data-role="done"]').checked;
        rows.push({ weight: weight ? Number(weight) : null, reps: reps ? Number(reps) : null, done });
      });
      exercises[name] = rows;
    });
    this.workoutLog[dateStr] = { dayType, exercises };
    await Storage.set("workoutlog", this.workoutLog);
    this.renderWorkoutDay(dateStr);
  },

  // ---------- PROGRESS ----------
  leanMass(weight, bf) {
    return weight * (1 - bf / 100);
  },
  fatMass(weight, bf) {
    return weight * (bf / 100);
  },

  renderProgress() {
    const p = this.profile;
    const scans = [...this.scans].sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = scans[scans.length - 1];
    const first = scans[0];

    const lean = this.leanMass(first.weight, first.bf);
    const goalWeightDerived = lean / (1 - p.goalBF / 100);
    const goalWeight = p.goalWeight || goalWeightDerived;
    const goalFatMass = goalWeight * (p.goalBF / 100);

    const currentFatMass = this.fatMass(latest.weight, latest.bf);
    const startFatMass = this.fatMass(first.weight, first.bf);
    const totalFatToLose = Math.max(startFatMass - goalFatMass, 0.01);
    const fatLostSoFar = Math.max(startFatMass - currentFatMass, 0);
    const pct = Math.min(100, Math.round((fatLostSoFar / totalFatToLose) * 100));

    let etaText;
    if (scans.length >= 2) {
      const weeks = (new Date(latest.date) - new Date(first.date)) / (7 * 86400000);
      const rate = weeks > 0 ? (startFatMass - currentFatMass) / weeks : 0;
      if (rate > 0.05) {
        const remainingFat = Math.max(currentFatMass - goalFatMass, 0);
        const weeksLeft = remainingFat / rate;
        etaText = remainingFat <= 0
          ? "Goal reached — nice work."
          : `At your actual rate (${rate.toFixed(2)} lb fat/week), about ${Math.ceil(weeksLeft)} more weeks.`;
      } else {
        etaText = "Not currently trending toward goal — recent scans show little to no fat loss. Check adherence to the deficit.";
      }
    } else {
      const assumedRate = 1.1;
      const weeksLeft = Math.max(currentFatMass - goalFatMass, 0) / assumedRate;
      etaText = `Estimated ~${Math.ceil(weeksLeft)} weeks at a theoretical 1-1.25 lb fat/week — log a few more scans for a real number.`;
    }

    document.getElementById("goal-summary").innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="val">${latest.weight}</div><div class="lbl">Weight (lb)</div></div>
        <div class="stat-box"><div class="val">${latest.bf}%</div><div class="lbl">Body fat</div></div>
        <div class="stat-box"><div class="val">${goalWeight.toFixed(0)}</div><div class="lbl">Goal (lb)</div></div>
      </div>
      <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
      <div class="row"><span style="color:var(--text-dim);font-size:0.8rem;">${pct}% of ${totalFatToLose.toFixed(0)} lb fat goal</span><span style="color:var(--text-dim);font-size:0.8rem;">Goal: ${p.goalBF}% BF</span></div>
      <p style="color:var(--text-dim);font-size:0.82rem;margin-top:10px;">${etaText}</p>
    `;

    const histEl = document.getElementById("scan-history");
    if (!scans.length) {
      histEl.innerHTML = `<p class="empty">No scans logged yet.</p>`;
    } else {
      const rows = [...scans].reverse().map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${s.weight} lb</td><td>${s.bf}%</td></tr>`).join("");
      histEl.innerHTML = `<table class="log-table"><thead><tr><th>Date</th><th>Weight</th><th>Body fat</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    document.getElementById("scan-date").value = todayISO();
    this.renderChart();
    this.renderExerciseTrends();
    this.renderConsistency();
    this.renderVolume();
  },

  // ---------- CONSISTENCY ----------
  dayVolume(dateStr) {
    const entry = this.workoutLog[dateStr];
    if (!entry) return 0;
    let total = 0;
    Object.values(entry.exercises || {}).forEach((sets) => {
      sets.forEach((s) => { if (s.weight && s.reps) total += s.weight * s.reps; });
    });
    return total;
  },

  getConsistency(weeksToShow = 10) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const weekStarts = [];
    for (let w = weeksToShow - 1; w >= 0; w--) {
      const ws = new Date(currentWeekStart);
      ws.setDate(currentWeekStart.getDate() - w * 7);
      weekStarts.push(ws);
    }

    const cells = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let w = 0; w < weekStarts.length; w++) {
        const d = new Date(weekStarts[w]);
        d.setDate(d.getDate() + dow);
        const dateStr = isoDate(d);
        let status = "future";
        if (d <= today) {
          const dayType = splitForDate(dateStr);
          if (dayType === "rest") status = "rest";
          else if (this.dayVolume(dateStr) > 0) status = "done";
          else status = dateStr === todayISO() ? "pending" : "missed";
        }
        cells.push({ date: dateStr, status });
      }
    }

    // Current streak: walk backward from today over scheduled (non-rest) days only.
    // Today gets a grace period if it's scheduled but not yet logged.
    let streak = 0;
    const orderedDates = [];
    for (let i = 0; i < weeksToShow * 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() - (weeksToShow - 1) * 7 + i);
      if (d <= today) orderedDates.push(isoDate(d));
    }
    for (let i = orderedDates.length - 1; i >= 0; i--) {
      const dateStr = orderedDates[i];
      const dayType = splitForDate(dateStr);
      if (dayType === "rest") continue;
      if (dateStr === todayISO() && this.dayVolume(dateStr) === 0) continue;
      if (this.dayVolume(dateStr) > 0) streak++;
      else break;
    }

    return { cells, streak, weeksToShow };
  },

  renderConsistency() {
    const summaryEl = document.getElementById("consistency-summary");
    const gridEl = document.getElementById("consistency-heatmap");
    if (!summaryEl || !gridEl) return;

    const { cells, streak, weeksToShow } = this.getConsistency();
    summaryEl.innerHTML = `<div class="streak-box"><span class="streak-num">${streak}</span><span class="streak-lbl">day streak on scheduled training days</span></div>`;
    gridEl.style.gridTemplateColumns = `repeat(${weeksToShow}, 1fr)`;
    gridEl.className = "heatmap-grid";
    gridEl.innerHTML = cells.map((c) => `<div class="hm-cell hm-${c.status}" title="${c.date}"></div>`).join("");
  },

  // ---------- WEEKLY VOLUME ----------
  getWeeklyVolume() {
    const weeks = {};
    Object.keys(this.workoutLog).forEach((date) => {
      const vol = this.dayVolume(date);
      if (vol <= 0) return;
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() - d.getDay());
      const weekStart = isoDate(d);
      const dayType = this.workoutLog[date].dayType || splitForDate(date);
      if (!weeks[weekStart]) weeks[weekStart] = { start: weekStart, total: 0, byType: {} };
      weeks[weekStart].total += vol;
      weeks[weekStart].byType[dayType] = (weeks[weekStart].byType[dayType] || 0) + vol;
    });
    return Object.values(weeks).sort((a, b) => (a.start < b.start ? 1 : -1));
  },

  renderVolume() {
    const container = document.getElementById("weekly-volume");
    if (!container) return;
    const weeks = this.getWeeklyVolume().slice(0, 8);
    if (!weeks.length) {
      container.innerHTML = `<p class="empty">Log a few workouts to see weekly volume.</p>`;
      return;
    }
    const maxTotal = Math.max(...weeks.map((w) => w.total));
    container.innerHTML = weeks.map((w) => {
      const start = new Date(w.start + "T00:00:00");
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const label = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      const pct = Math.max(4, Math.round((w.total / maxTotal) * 100));
      const breakdown = Object.entries(w.byType)
        .filter(([type]) => type !== "rest")
        .map(([type, vol]) => `${DAY_LABEL[type]} ${Math.round(vol).toLocaleString()}`)
        .join(" · ");
      return `<div class="volume-row">
        <div class="volume-head"><span class="wk-label">${label}</span><span class="wk-total">${Math.round(w.total).toLocaleString()} lb</span></div>
        <div class="volume-bar-track"><div class="volume-bar-fill" style="width:${pct}%"></div></div>
        <div class="volume-breakdown">${breakdown}</div>
      </div>`;
    }).join("");
  },

  getAllExerciseNames() {
    const names = new Set();
    Object.values(PLAN).forEach((list) => list.forEach((ex) => names.add(ex.name)));
    return [...names];
  },

  getExerciseHistory(name) {
    const points = [];
    Object.keys(this.workoutLog).sort().forEach((date) => {
      const sets = this.workoutLog[date].exercises?.[name];
      if (!sets) return;
      const weights = sets.map((s) => s.weight).filter((w) => w != null && w > 0);
      if (!weights.length) return;
      points.push({ date, weight: Math.max(...weights) });
    });
    return points;
  },

  renderExerciseTrends() {
    const container = document.getElementById("exercise-trends");
    if (!container) return;
    const rows = this.getAllExerciseNames()
      .map((name) => ({ name, points: this.getExerciseHistory(name) }))
      .filter((r) => r.points.length > 0)
      .sort((a, b) => b.points.length - a.points.length);

    if (!rows.length) {
      container.innerHTML = `<p class="empty">Log a few workouts to see strength trends.</p>`;
      return;
    }

    container.innerHTML = rows.map((r) => {
      const first = r.points[0].weight;
      const last = r.points[r.points.length - 1].weight;
      const delta = last - first;
      let cls = "flat", badge = "No change";
      if (r.points.length < 2) {
        cls = "flat"; badge = "1 session";
      } else if (delta > 0) {
        cls = "up"; badge = `↑ +${delta} lb`;
      } else if (delta < 0) {
        cls = "down"; badge = `↓ ${delta} lb`;
      } else {
        cls = "flat"; badge = "→ No change";
      }
      const canvasId = `spark-${r.name.replace(/[^a-zA-Z0-9]/g, "")}`;
      return `<div class="exercise-trend-row">
        <div class="exercise-trend-info">
          <div class="exercise-trend-name">${r.name}</div>
          <div class="exercise-trend-meta">${r.points.length} session${r.points.length > 1 ? "s" : ""} · ${first}→${last} lb</div>
        </div>
        <canvas class="sparkline" id="${canvasId}" width="90" height="32"></canvas>
        <div class="trend-badge ${cls}">${badge}</div>
      </div>`;
    }).join("");

    rows.forEach((r) => this.drawSparkline(`spark-${r.name.replace(/[^a-zA-Z0-9]/g, "")}`, r.points));
  },

  drawSparkline(canvasId, points) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, pad = 4;
    ctx.clearRect(0, 0, W, H);
    if (points.length < 2) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#9aa2ac";
      ctx.fill();
      return;
    }
    const weights = points.map((p) => p.weight);
    const min = Math.min(...weights), max = Math.max(...weights);
    const range = max - min || 1;
    const x = (i) => pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = (w) => H - pad - ((w - min) / range) * (H - pad * 2);
    const color = weights[weights.length - 1] > weights[0] ? "#3ecf8e" : weights[weights.length - 1] < weights[0] ? "#ff6b6b" : "#9aa2ac";

    ctx.beginPath();
    points.forEach((p, i) => { const px = x(i), py = y(p.weight); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x(points.length - 1), y(weights[weights.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  },

  renderChart() {
    const canvas = document.getElementById("trend-chart");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height, pad = 24;
    ctx.clearRect(0, 0, W, H);

    const scans = [...this.scans].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (scans.length < 2) {
      ctx.fillStyle = "#9aa2ac";
      ctx.font = "13px sans-serif";
      ctx.fillText("Log at least two scans to see a trend", pad, H / 2);
      return;
    }

    const weights = scans.map((s) => s.weight);
    const bfs = scans.map((s) => s.bf);
    const wMin = Math.min(...weights) - 2, wMax = Math.max(...weights) + 2;
    const bMin = Math.min(...bfs) - 2, bMax = Math.max(...bfs) + 2;

    const x = (i) => pad + (i / (scans.length - 1)) * (W - pad * 2);
    const yW = (v) => H - pad - ((v - wMin) / (wMax - wMin)) * (H - pad * 2);
    const yB = (v) => H - pad - ((v - bMin) / (bMax - bMin)) * (H - pad * 2);

    ctx.beginPath();
    scans.forEach((s, i) => { const px = x(i), py = yW(s.weight); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.strokeStyle = "#ff5a1f"; ctx.lineWidth = 2; ctx.stroke();
    scans.forEach((s, i) => { ctx.beginPath(); ctx.arc(x(i), yW(s.weight), 3, 0, Math.PI * 2); ctx.fillStyle = "#ff5a1f"; ctx.fill(); });

    ctx.beginPath();
    scans.forEach((s, i) => { const px = x(i), py = yB(s.bf); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.strokeStyle = "#4f9ddb"; ctx.lineWidth = 2; ctx.stroke();
    scans.forEach((s, i) => { ctx.beginPath(); ctx.arc(x(i), yB(s.bf), 3, 0, Math.PI * 2); ctx.fillStyle = "#4f9ddb"; ctx.fill(); });
  },

  async addScan() {
    const date = document.getElementById("scan-date").value || todayISO();
    const weight = Number(document.getElementById("scan-weight").value);
    const bf = Number(document.getElementById("scan-bf").value);
    if (!weight || !bf) {
      alert("Enter both weight and body fat %.");
      return;
    }
    this.scans = this.scans.filter((s) => s.date !== date);
    this.scans.push({ date, weight, bf });
    await Storage.set("bodyscans", this.scans);
    document.getElementById("scan-weight").value = "";
    document.getElementById("scan-bf").value = "";
    this.renderProgress();
  },

  // ---------- SETTINGS ----------
  fillSettingsForm() {
    const p = this.profile;
    document.getElementById("set-start-weight").value = p.startWeight;
    document.getElementById("set-start-bf").value = p.startBF;
    document.getElementById("set-goal-weight").value = p.goalWeight;
    document.getElementById("set-goal-bf").value = p.goalBF;
    document.getElementById("set-tee").value = p.tee;
  },

  async saveProfile() {
    this.profile.startWeight = Number(document.getElementById("set-start-weight").value);
    this.profile.startBF = Number(document.getElementById("set-start-bf").value);
    this.profile.goalWeight = Number(document.getElementById("set-goal-weight").value);
    this.profile.goalBF = Number(document.getElementById("set-goal-bf").value);
    this.profile.tee = Number(document.getElementById("set-tee").value);
    await Storage.set("profile", this.profile);
    this.renderProgress();
    alert("Profile saved.");
  },

  exportData() {
    const payload = { profile: this.profile, bodyscans: this.scans, workoutlog: this.workoutLog };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iron-log-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async importData() {
    const raw = document.getElementById("import-box").value.trim();
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      if (payload.profile) { this.profile = payload.profile; await Storage.set("profile", this.profile); }
      if (payload.bodyscans) { this.scans = payload.bodyscans; await Storage.set("bodyscans", this.scans); }
      if (payload.workoutlog) { this.workoutLog = payload.workoutlog; await Storage.set("workoutlog", this.workoutLog); }
      this.renderAll();
      alert("Data imported.");
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  },

  async clearData() {
    if (!confirm("This clears all local data on this device (Supabase data, if synced, is untouched). Continue?")) return;
    ["profile", "bodyscans", "workoutlog"].forEach((k) => localStorage.removeItem("ironlog_" + k));
    location.reload();
  },
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed:", e));
  });
}

App.init();
