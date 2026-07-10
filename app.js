/* Iron Log — 4-day split (Push/Pull/Legs/Full Body) + meal tracker + body-scan progress. */

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
    { name: "Deadlift", sets: 3, reps: "5" },
    { name: "Pull-Ups / Lat Pulldown", sets: 4, reps: "8-10" },
    { name: "Barbell Row", sets: 3, reps: "8-10" },
    { name: "Face Pulls", sets: 3, reps: "15" },
    { name: "Barbell Curl", sets: 3, reps: "10-12" },
    { name: "Rear Delt Fly", sets: 3, reps: "12-15" },
  ],
  legs: [
    { name: "Back Squat", sets: 4, reps: "6-8" },
    { name: "Romanian Deadlift", sets: 3, reps: "8-10" },
    { name: "Leg Press", sets: 3, reps: "10-12" },
    { name: "Leg Curl", sets: 3, reps: "12" },
    { name: "Walking Lunges", sets: 3, reps: "10/leg" },
    { name: "Calf Raises", sets: 4, reps: "15" },
  ],
  full: [
    { name: "Back Squat", sets: 3, reps: "8" },
    { name: "Bench Press", sets: 3, reps: "8" },
    { name: "Bent-Over Row", sets: 3, reps: "8" },
    { name: "Seated Overhead Press", sets: 3, reps: "8" },
    { name: "Romanian Deadlift", sets: 3, reps: "8" },
    { name: "Plank", sets: 3, reps: "30-45s" },
  ],
  rest: [],
};

const DAY_LABEL = { push: "Push", pull: "Pull", legs: "Legs", full: "Full Body", rest: "Rest" };
// index 0 = Sunday ... 6 = Saturday
const WEEKDAY_SPLIT = ["rest", "push", "pull", "legs", "rest", "full", "rest"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MEAL_MACROS = {
  breakfast: { kcal: 470, protein: 54 },
  chicken: { kcal: 750, protein: 83 },
  beef: { kcal: 805, protein: 63 },
};

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
  mealLog: {}, // { date: { breakfast:bool, lunch:{done,protein}, dinner:{done,protein} } }
  selectedWorkoutDate: todayISO(),

  async init() {
    this.profile = (await Storage.get("profile")) || { ...DEFAULT_PROFILE, startDate: todayISO() };
    this.scans = (await Storage.get("bodyscans")) || [];
    this.workoutLog = (await Storage.get("workoutlog")) || {};
    this.mealLog = (await Storage.get("meallog")) || {};

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
    if (view === "progress") this.renderChart();
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
    this.renderToday();
    this.renderWorkoutWeek();
    this.renderWorkoutDay(this.selectedWorkoutDate);
    this.renderNutrition();
    this.renderProgress();
    this.fillSettingsForm();
  },

  // ---------- TODAY ----------
  renderToday() {
    const date = todayISO();
    const dayType = splitForDate(date);
    const card = document.getElementById("today-workout-card");
    if (dayType === "rest") {
      card.innerHTML = `<h2>Today <span class="pill rest">Rest</span></h2><p class="empty">Recovery day. Light walk or mobility work if you feel like it.</p>`;
    } else {
      const exercises = PLAN[dayType];
      card.innerHTML = `
        <h2>Today <span class="pill ${dayType}">${DAY_LABEL[dayType]}</span></h2>
        <p style="color:var(--text-dim);font-size:0.85rem;margin:0 0 4px;">${exercises.length} exercises — open the Workout tab to log sets.</p>
        <button class="btn small" onclick="App.switchView('workout')">Log today's workout</button>
      `;
    }
    this.renderMealChecklist(document.getElementById("today-meals-card"), date, true);
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

  // ---------- NUTRITION ----------
  renderMealChecklist(container, date, compact) {
    const log = this.mealLog[date] || { breakfast: false, lunch: { done: false, protein: "chicken" }, dinner: { done: false, protein: "chicken" } };
    container.innerHTML = `
      <h2>Meals${compact ? "" : " — " + fmtDate(date)}</h2>
      <div class="meal-card">
        <input type="checkbox" id="meal-breakfast" ${log.breakfast ? "checked" : ""} onchange="App.toggleMeal('${date}','breakfast')">
        <div class="meal-body">
          <div class="meal-name">Breakfast</div>
          <div class="meal-desc">25g protein scoop + 10oz 2% milk + 3 eggs</div>
          <div class="macros">~${MEAL_MACROS.breakfast.kcal} kcal · ${MEAL_MACROS.breakfast.protein}g protein (est.)</div>
        </div>
      </div>
      ${["lunch", "dinner"].map((meal) => {
        const m = log[meal] || { done: false, protein: "chicken" };
        const macros = MEAL_MACROS[m.protein];
        return `<div class="meal-card">
          <input type="checkbox" id="meal-${meal}" ${m.done ? "checked" : ""} onchange="App.toggleMeal('${date}','${meal}')">
          <div class="meal-body">
            <div class="meal-name">${meal[0].toUpperCase() + meal.slice(1)}</div>
            <div class="meal-desc">Rice, veggies, cheese, sriracha</div>
            <div class="macros">~${macros.kcal} kcal · ${macros.protein}g protein (est.)</div>
            <div class="toggle-group">
              <button class="toggle-btn ${m.protein === "chicken" ? "active" : ""}" onclick="App.setProtein('${date}','${meal}','chicken')">Chicken</button>
              <button class="toggle-btn ${m.protein === "beef" ? "active" : ""}" onclick="App.setProtein('${date}','${meal}','beef')">Beef</button>
            </div>
          </div>
        </div>`;
      }).join("")}
    `;
  },

  ensureMealEntry(date) {
    if (!this.mealLog[date]) {
      this.mealLog[date] = { breakfast: false, lunch: { done: false, protein: "chicken" }, dinner: { done: false, protein: "chicken" } };
    }
    return this.mealLog[date];
  },

  async toggleMeal(date, meal) {
    const entry = this.ensureMealEntry(date);
    if (meal === "breakfast") entry.breakfast = !entry.breakfast;
    else entry[meal].done = !entry[meal].done;
    await Storage.set("meallog", this.mealLog);
    this.renderToday();
    this.renderNutrition();
  },

  async setProtein(date, meal, protein) {
    const entry = this.ensureMealEntry(date);
    entry[meal].protein = protein;
    await Storage.set("meallog", this.mealLog);
    this.renderToday();
    this.renderNutrition();
  },

  renderNutrition() {
    this.renderMealChecklist(document.getElementById("nutrition-plan-card"), todayISO(), false);

    const histEl = document.getElementById("meal-history");
    const dates = Object.keys(this.mealLog).sort().reverse().slice(0, 7);
    if (!dates.length) {
      histEl.innerHTML = `<p class="empty">No meals logged yet.</p>`;
      return;
    }
    let rows = dates.map((d) => {
      const l = this.mealLog[d];
      const count = (l.breakfast ? 1 : 0) + (l.lunch?.done ? 1 : 0) + (l.dinner?.done ? 1 : 0);
      return `<tr><td>${fmtDate(d)}</td><td>${count}/3 meals</td></tr>`;
    }).join("");
    histEl.innerHTML = `<table class="log-table"><thead><tr><th>Date</th><th>Completed</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    const payload = { profile: this.profile, bodyscans: this.scans, workoutlog: this.workoutLog, meallog: this.mealLog };
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
      if (payload.meallog) { this.mealLog = payload.meallog; await Storage.set("meallog", this.mealLog); }
      this.renderAll();
      alert("Data imported.");
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  },

  async clearData() {
    if (!confirm("This clears all local data on this device (Supabase data, if synced, is untouched). Continue?")) return;
    ["profile", "bodyscans", "workoutlog", "meallog"].forEach((k) => localStorage.removeItem("ironlog_" + k));
    location.reload();
  },
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed:", e));
  });
}

App.init();
