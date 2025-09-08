import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Toaster, toast } from "react-hot-toast";
import confetti from "canvas-confetti";

/* ===================== Theme boot ===================== */
const THEME_KEY = "theme";
(() => {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    if (saved === "dark") document.documentElement.classList.add("dark");
  } else {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    if (prefersDark) document.documentElement.classList.add("dark");
    localStorage.setItem(THEME_KEY, prefersDark ? "dark" : "light");
  }
})();

/* ===================== Helpers ===================== */
const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid = () => Math.random().toString(36).slice(2);

// Use local date key (not UTC) to avoid day shift at midnight
const todayKey = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d - off * 60_000).toISOString().slice(0, 10);
};

const isDark = () => document.documentElement.classList.contains("dark");
const secureOk = () =>
  window.isSecureContext || location.hostname === "localhost";

// Minutes done TODAY
function sumTodayMinutes(history) {
  const day = todayKey();
  return (history ?? []).reduce(
    (acc, e) => acc + (e.day === day ? e.mins : 0),
    0
  );
}

/* ---------- Web Notifications ---------- */
const canNotify = () => "Notification" in window;

async function ensurePermission() {
  if (!canNotify()) return false;
  if (!secureOk()) return false; // only HTTPS/localhost
  if (Notification.permission === "granted") return true;
  const p = await Notification.requestPermission();
  return p === "granted";
}
// put this once near the top of the file (after helpers/imports)
const ICON_URL = new URL("favicon.ico", import.meta.env.BASE_URL).toString();

function notify(title, options = {}) {
  try {
    if (!canNotify()) return;
    if (!secureOk()) return;
    if (Notification.permission !== "granted") return;

    new Notification(title, {
      // user-provided options first…
      ...options,

      // …but enforce safe defaults
      requireInteraction: true,
      renotify: true,
      tag: options.tag || "focusflow",
      silent: false,
      icon: options.icon ?? ICON_URL,
      badge: options.badge ?? ICON_URL,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.warn("notify failed", e);
  }
}

/* ---------- Export / Import ---------- */
function exportData() {
  const data = {
    todos: load("ff.todos", []),
    habits: load("ff.habits", []),
    pomo: load("ff.pomo", { minutes: 25, sessions: 0, history: [] }),
    soundVol: load("ff.soundVol", 0.9),
    melody: load("ff.melody", "victory"),
    goalMins: load("ff.goalMins", 60),
    theme: localStorage.getItem(THEME_KEY) || "light",
    version: 2,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focusflow-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
async function importDataFromFile(file, onDone) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.todos) save("ff.todos", data.todos);
    if (data.habits) save("ff.habits", data.habits);
    if (data.pomo) save("ff.pomo", data.pomo);
    if (typeof data.soundVol === "number") save("ff.soundVol", data.soundVol);
    if (data.melody) save("ff.melody", data.melody);
    if (typeof data.goalMins === "number") save("ff.goalMins", data.goalMins);
    if (data.theme) localStorage.setItem(THEME_KEY, data.theme);
    onDone?.();
  } catch {
    alert("Import failed: invalid file");
  }
}

/* ---------- Melodies (WebAudio) ---------- */
const NOTE_OFFSETS = {
  C: -9,
  "C#": -8,
  Db: -8,
  D: -7,
  "D#": -6,
  Eb: -6,
  E: -5,
  F: -4,
  "F#": -3,
  Gb: -3,
  G: -2,
  "G#": -1,
  Ab: -1,
  A: 0,
  "A#": 1,
  Bb: 1,
  B: 2,
};
function noteToFreq(name) {
  const m = String(name).match(/^([A-G](?:#|b)?)(-?\d)$/);
  if (!m) return null;
  const [, pitch, octStr] = m;
  const oct = parseInt(octStr, 10);
  const semis = (oct - 4) * 12 + NOTE_OFFSETS[pitch];
  return 440 * Math.pow(2, semis / 12);
}
const MELODIES = {
  victory: {
    label: "Victory",
    bpm: 140,
    type: "triangle",
    notes: [
      ["C5", 1],
      ["E5", 1],
      ["G5", 1],
      ["C6", 1.5],
      ["G5", 0.5],
      ["E5", 1],
      ["C5", 1],
    ],
  },
  chill: {
    label: "Chill",
    bpm: 96,
    type: "sine",
    notes: [
      ["G4", 1],
      ["B4", 1],
      ["D5", 1],
      ["G5", 1.5],
      [null, 0.5],
      ["D5", 1],
      ["B4", 1],
      ["G4", 1.5],
    ],
  },
  arcade: {
    label: "Arcade",
    bpm: 160,
    type: "square",
    notes: [
      ["E5", 0.5],
      [null, 0.25],
      ["G5", 0.5],
      ["B5", 0.5],
      ["E6", 0.75],
      ["D6", 0.25],
      ["C6", 0.75],
    ],
  },
  bells: {
    label: "Bells",
    bpm: 120,
    type: "sine",
    notes: [
      ["C5", 0.75],
      ["G5", 0.75],
      ["E5", 1],
      [null, 0.25],
      ["C6", 0.75],
    ],
  },
  sunrise: {
    label: "Sunrise",
    bpm: 110,
    type: "triangle",
    notes: [
      ["A4", 0.5],
      ["C5", 0.5],
      ["E5", 0.5],
      ["A5", 1],
      ["E5", 0.5],
      ["C5", 0.5],
      ["A4", 1],
    ],
  },
};

// ===== WebAudio core =====
let gAudioCtx = null;
function ensureAudioContext() {
  try {
    if (!gAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      gAudioCtx = new Ctx();
    }
    if (gAudioCtx.state === "suspended") gAudioCtx.resume();
    return gAudioCtx;
  } catch {
    return null;
  }
}

// ---- PRIME AUDIO (single “wake up” to allow sound later) ----
let gAudioPrimed = false;
function primeAudio() {
  const ctx = ensureAudioContext();
  if (!ctx || gAudioPrimed) return ctx;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.00001; // nearly silent
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {}
  gAudioPrimed = true;
  return ctx;
}

function playMelodyByName(ctx, name, vol = 0.9) {
  if (!ctx) return;
  const conf = MELODIES[name] || MELODIES.victory;
  const secPerBeat = 60 / conf.bpm;
  let t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.connect(ctx.destination);
  conf.notes.forEach(([n, beats]) => {
    const dur = Math.max(0.12, beats * secPerBeat);
    if (n) {
      const f = noteToFreq(n);
      if (f) {
        const o = ctx.createOscillator();
        o.type = conf.type || "triangle";
        o.frequency.setValueAtTime(f, t);
        o.connect(g);
        o.start(t);
        o.stop(t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      }
    }
    t += dur;
  });
}
function playBeep(ctx, vol = 0.7) {
  // Two short beeps (audible but not annoying)
  const mk = (freq, startOffset, dur = 0.28) => {
    const t0 = ctx.currentTime + startOffset;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t0);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.stop(t0 + dur + 0.02);
  };
  mk(880, 0.0);
  mk(1320, 0.35);
}

/* ===================== Seed demo ===================== */
const seedIfEmpty = () => {
  if (!localStorage.getItem("ff.todos")) {
    save("ff.todos", [
      {
        id: uid(),
        title: "Ship portfolio update",
        done: false,
        createdAt: Date.now(),
        priority: "med",
        due: todayKey(),
        time: "",
        remindMins: 60,
        estimateMins: 25,
        startedAt: null, // NEW
      },
      {
        id: uid(),
        title: "15m English practice",
        done: true,
        createdAt: Date.now(),
        priority: "med",
        due: todayKey(),
        time: "",
        remindMins: 60,
        estimateMins: 15,
        startedAt: null, // NEW
      },
    ]);
  }
  if (!localStorage.getItem("ff.habits")) {
    save("ff.habits", [
      { id: uid(), name: "English", mins: 15, streak: 2, lastDone: todayKey() },
      { id: uid(), name: "Code", mins: 30, streak: 1, lastDone: "" },
    ]);
  }
  if (!localStorage.getItem("ff.pomo")) {
    save("ff.pomo", { minutes: 25, sessions: 0, history: [] });
  }
  if (!localStorage.getItem("ff.goalMins")) {
    save("ff.goalMins", 60);
  }
};
seedIfEmpty();

/* ===================== App ===================== */
/** @typedef {{ id: string, title: string, done: boolean, createdAt: number,
      priority?: 'low'|'med'|'high', due?: string, time?: string, remindMins?: number,
      estimateMins?: number, startedAt?: number|null }} Todo */
/** @typedef {{ id: string, name: string, streak: number, lastDone: string, mins: number }} Habit */

export default function FocusFlow() {
  const [themeTick, setThemeTick] = useState(0);

  // Enable AudioContext after the first user interaction (so later sounds work)
  useEffect(() => {
    const onPointer = () => primeAudio();
    const onKey = () => primeAudio();
    window.addEventListener("pointerdown", onPointer, { once: true });
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Todos (backfill extra fields)
  const [todos, setTodos] = useState(
    /** @type {Todo[]} */ (
      (load("ff.todos", []) || []).map((t) => ({
        ...t,
        priority: t.priority || "med",
        due: t.due || "",
        time: t.time || "",
        remindMins: typeof t.remindMins === "number" ? t.remindMins : 60,
        estimateMins:
          typeof t.estimateMins === "number" ? t.estimateMins : null,
        startedAt: typeof t.startedAt === "number" ? t.startedAt : null,
      }))
    )
  );
  useEffect(() => save("ff.todos", todos), [todos]);

  // Habits (backfill mins)
  const [habits, setHabits] = useState(
    /** @type {Habit[]} */ (
      (load("ff.habits", []) || []).map((h) => ({
        ...h,
        mins: typeof h.mins === "number" ? h.mins : 15,
      }))
    )
  );
  useEffect(() => save("ff.habits", habits), [habits]);

  // Pomodoro
  const [pomo, setPomo] = useState(
    load("ff.pomo", { minutes: 25, sessions: 0, history: [] })
  );
  useEffect(() => save("ff.pomo", pomo), [pomo]);

  // Start from habit
  const [startSignal, setStartSignal] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const startHabit = async (habit) => {
    ensureAudioContext();
    await ensurePermission();
    const m = Math.max(5, Math.min(60, Number(habit.mins) || 15));
    setPomo({ ...pomo, minutes: m });
    setCurrentTask(`${habit.name} • ${m}m`);
    setStartSignal((s) => s + 1);
  };
  // Start from task (use estimateMins if set)
  const startTask = async (todo) => {
    ensureAudioContext();
    await ensurePermission();
    const est = Number(todo.estimateMins);
    const m = Math.max(
      5,
      Math.min(60, Number.isFinite(est) && est > 0 ? est : pomo.minutes)
    );
    setPomo({ ...pomo, minutes: m });
    setCurrentTask(`${todo.title} • ${m}m`);
    setStartSignal((s) => s + 1);
  };

  // One-time "today tasks" summary (do NOT ask for permission here)
  useEffect(() => {
    const day = todayKey();
    const key = "ff.todoSummary@" + day;
    if (localStorage.getItem(key) === "1") return;

    const dueToday = (todos || []).filter((t) => !t.done && t.due === day);
    if (dueToday.length === 0) return;

    localStorage.setItem(key, "1");
    toast(
      `📅 ${dueToday.length} task(s) today: ${dueToday[0].title}${
        dueToday.length > 1 ? " +" + (dueToday.length - 1) : ""
      }`,
      { duration: 5000 }
    );

    if (canNotify() && Notification.permission === "granted") {
      notify("Today's tasks", {
        body: dueToday
          .slice(0, 5)
          .map((t) => "• " + t.title)
          .join("\n"),
        silent: true,
      });
    }
  }, [todos]);

  // === Task reminders (even when tab is focused) ===
  useEffect(() => {
    const KEY = (t) => `ff.todoRem@${t.id}@${t.due}@${t.remindMins || 0}`;

    // Fire reminder: sound + banner + toast
    const fireReminder = (t) => {
      const ctx = ensureAudioContext();
      const vol = load("ff.soundVol", 0.9);
      if (ctx) playBeep(ctx, vol);

      notify("Task reminder", {
        body:
          `${t.title} • due ${t.due}${t.time ? " " + t.time : ""}` +
          (t.remindMins ? ` (in ${t.remindMins} min)` : ""),
        tag: KEY(t),
        requireInteraction: true,
        renotify: true,
      });

      if ("vibrate" in navigator) navigator.vibrate([120, 60, 120]);
      toast(`🔔 ${t.title}`, { duration: 4000 });
    };

    // One-time UX tip if notifications are not enabled
    const WARN_KEY = "ff.notifWarned";
    if (
      (!secureOk() || Notification.permission !== "granted") &&
      localStorage.getItem(WARN_KEY) !== "1"
    ) {
      localStorage.setItem(WARN_KEY, "1");
      toast.error(
        "Enable notifications (HTTPS or localhost) — click 'Enable notifications' above."
      );
    }

    // Deadline check loop
    const check = () => {
      const now = Date.now();
      (todos || []).forEach((t) => {
        if (!t.due) return;
        const time = t.time && /^\d{2}:\d{2}$/.test(t.time) ? t.time : "09:00";
        const dueMs = new Date(`${t.due}T${time}:00`).getTime();
        const ahead = Math.max(0, (t.remindMins || 0) * 60000);
        const fireFrom = dueMs - ahead;
        const fireTo = dueMs + 5 * 60 * 1000;
        const k = KEY(t);
        const notFiredYet = localStorage.getItem(k) !== "1";
        if (now >= fireFrom && now <= fireTo && notFiredYet) {
          localStorage.setItem(k, "1");
          fireReminder(t);
        }
      });
    };

    check();
    const id = setInterval(check, 10 * 1000);

    // Also check when visibility/focus changes
    const onVis = () => check();
    const onFocus = () => check();
    const onBlur = () => check();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [todos]);

  return (
    <div
      className="
        min-h-screen transition-colors duration-300
        bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900
        dark:from-slate-950 dark:to-slate-900 dark:text-slate-100
      "
    >
      {/* Header */}
      <header className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            FocusFlow
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Habits • Pomodoro • Mini-Kanban
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportData}
            className="px-3 py-1.5 rounded-xl bg-white border text-sm shadow-sm hover:shadow
                       dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
          >
            Export
          </button>

          <label
            className="px-3 py-1.5 rounded-xl bg-white border text-sm shadow-sm hover:shadow cursor-pointer
                       dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
          >
            Import
            <input
              type="file"
              accept="application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await importDataFromFile(f, () => location.reload());
              }}
              className="hidden"
            />
          </label>

          <a
            className="px-3 py-1.5 rounded-xl bg-black text-white text-sm shadow-sm hover:shadow md:px-4
                       dark:bg-white dark:text-slate-900"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              localStorage.clear();
              seedIfEmpty();
              location.reload();
            }}
          >
            Reset
          </a>

          <a
            className="px-3 py-1.5 rounded-xl bg-white text-slate-900 border text-sm shadow-sm hover:shadow
                       dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
          >
            View Docs
          </a>

          <button
            onClick={() => {
              const r = document.documentElement;
              const next = r.classList.toggle("dark");
              localStorage.setItem(THEME_KEY, next ? "dark" : "light");
              setThemeTick((t) => t + 1);
              primeAudio();
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white
                       dark:bg-slate-100 dark:text-slate-900"
          >
            Toggle theme
          </button>

          {/* Enable notifications (ask permission only on user action) */}
          <button
            onClick={async () => {
              primeAudio();
              const okSecure = secureOk();
              if (!okSecure) {
                toast.error("Notifications need HTTPS or localhost");
                return;
              }
              const ok = await ensurePermission();
              if (ok) {
                notify("✅ Notifications enabled", {
                  body: "I'll alert you here.",
                  silent: false,
                  icon: "/favicon.ico",
                  badge: "/favicon.ico",
                });
                const ctx = ensureAudioContext();
                if (ctx) playBeep(ctx, 0.9);
                toast.success("Notifications enabled");
              } else {
                toast.error("Allow notifications in the browser settings");
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-white border text-sm shadow-sm hover:shadow
             dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
          >
            Enable notifications
          </button>
        </div>
      </header>

      {/* Toaster */}
      <Toaster
        key={themeTick}
        position="top-right"
        toastOptions={{
          style: {
            background: isDark() ? "#0f172a" : "#ffffff",
            color: isDark() ? "#e2e8f0" : "#0f172a",
            border: `1px solid ${isDark() ? "#334155" : "#e2e8f0"}`,
          },
        }}
      />

      {/* Main grid */}
      <main className="max-w-7xl mx-auto px-4 pb-12 grid gap-6 md:grid-cols-2 xl:grid-cols-12">
        {/* Tasks */}
        <SectionCard className="xl:col-span-8">
          <h2 className="text-lg font-semibold mb-4">Tasks (Mini-Kanban)</h2>
          <Board todos={todos} setTodos={setTodos} onStartTask={startTask} />
        </SectionCard>

        {/* Pomodoro */}
        <SectionCard className="xl:col-span-4">
          <h2 className="text-lg font-semibold mb-4">Pomodoro</h2>
          <Pomodoro
            pomo={pomo}
            setPomo={setPomo}
            externalStartSignal={startSignal}
            currentTask={currentTask}
          />
        </SectionCard>

        {/* Habits */}
        <SectionCard className="xl:col-span-4">
          <h2 className="text-lg font-semibold mb-4">Habits & Streaks</h2>
          <Habits
            habits={habits}
            setHabits={setHabits}
            onStartHabit={startHabit}
          />
        </SectionCard>

        {/* Daily Goal */}
        <SectionCard className="xl:col-span-8">
          <DailyGoal pomo={pomo} />
        </SectionCard>

        {/* Weekly chart */}
        <SectionCard className="xl:col-span-12">
          <h2 className="text-lg font-semibold mb-4">This Week</h2>
          <WeeklyChart key={themeTick} pomo={pomo} />
        </SectionCard>
      </main>
    </div>
  );
}

/* ======= Small UI helpers (Pill) ======= */
const PILL = {
  slate: "bg-slate-500/15 text-slate-300",
  sky: "bg-sky-500/15 text-sky-300",
  rose: "bg-rose-500/15 text-rose-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  indigo: "bg-indigo-500/15 text-indigo-300",
  violet: "bg-violet-500/15 text-violet-300",
};
function Pill({ children, variant = "slate" }) {
  const cls = PILL[variant] || PILL.slate;
  return (
    <span className={`text-[11px] rounded-full px-2 py-0.5 ${cls}`}>
      {children}
    </span>
  );
}

/* ===================== UI blocks ===================== */
function SectionCard({ children, className = "" }) {
  return (
    <motion.section
      layout
      className={
        "bg-white border border-slate-200 rounded-2xl shadow-sm p-4 md:p-6 " +
        "dark:bg-slate-800 dark:border-slate-700 transition-colors duration-300 " +
        className
      }
    >
      {children}
    </motion.section>
  );
}

/* ---------- Tasks board (DnD-ish, priorities, deadlines, search/filters) ---------- */
function Board({ todos, setTodos, onStartTask }) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("med");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [remind, setRemind] = useState(60);
  const [estimate, setEstimate] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | high | med | low | overdue | today | missed

  const isOverdue = (d) => d && d < todayKey();
  const isToday = (d) => d && d === todayKey();

  // Missed: has date+time, they passed (with grace), not done and not started
  const GRACE_MIN = 5;
  const isMissed = (t) => {
    if (!t || !t.due || !t.time) return false;
    if (t.done || t.startedAt) return false;
    const dueMs = new Date(`${t.due}T${t.time}:00`).getTime();
    return Date.now() > dueMs + GRACE_MIN * 60 * 1000;
  };

  // Key to avoid boosting the same task multiple times
  const PRIO_KEY = (t) => `ff.boostHigh@${t.id}@${t.due || ""}@${t.time || ""}`;

  // Auto-boost priority for “Missed” tasks
  useEffect(() => {
    let changed = false;
    const updated = todos.map((t) => {
      if (!t || t.done) return t;
      if (!isMissed(t)) return t;
      if (t.priority === "high") return t;
      const k = PRIO_KEY(t);
      if (localStorage.getItem(k) === "1") return t;
      localStorage.setItem(k, "1");
      changed = true;
      toast("⚠️ Missed task — priority set to High", { duration: 2500 });
      return { ...t, priority: "high" };
    });
    if (changed) setTodos(updated);
  }, [todos]);

  const add = () => {
    if (!text.trim()) return;
    const t = {
      id: uid(),
      title: text.trim(),
      done: false,
      createdAt: Date.now(),
      priority,
      due,
      time,
      remindMins: Number(remind) || 0,
      estimateMins: estimate ? Number(estimate) : null,
      startedAt: null,
    };
    setTodos([t, ...todos]);
    setText("");
    setPriority("med");
    setDue("");
    setTime("");
    setRemind(60);
    setEstimate("");
    if (Number(remind) > 0) ensurePermission();
  };

  const toggle = (id) =>
    setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTodos(todos.filter((t) => t.id !== id));
  const update = (id, patch) =>
    setTodos(todos.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const rawTodo = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  const match = (t) => {
    const okQ = !q || t.title.toLowerCase().includes(q.toLowerCase());
    let okF = true;
    if (filter === "high") okF = t.priority === "high";
    if (filter === "med") okF = t.priority === "med";
    if (filter === "low") okF = t.priority === "low";
    if (filter === "overdue") okF = isOverdue(t.due);
    if (filter === "today") okF = isToday(t.due);
    if (filter === "missed") okF = isMissed(t);
    return okQ && okF;
  };

  const todo = rawTodo
    .slice()
    .sort((a, b) => {
      const am = isMissed(a),
        bm = isMissed(b);
      if (am !== bm) return am ? -1 : 1; // keep Missed on top
      const ao = isOverdue(a.due),
        bo = isOverdue(b.due);
      if (ao !== bo) return ao ? -1 : 1;
      const at = isToday(a.due),
        bt = isToday(b.due);
      if (at !== bt) return at ? -1 : 1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      return b.createdAt - a.createdAt;
    })
    .filter(match);

  const doneFiltered = done.filter(match);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        {/* Add row */}
        <div className="mb-3">
          <div className="flex flex-wrap md:flex-row items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Add a task…"
              className="h-9 min-w-0 flex-[1_1_240px] rounded-xl border border-slate-200 bg-white text-slate-900 px-3
                         focus:outline-none focus:ring-2 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              title="Priority"
              className="h-9 shrink-0 w-[88px] rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="high">High</option>
              <option value="med">Med</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              title="Due date"
              className="h-9 shrink-0 w-[130px] rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              title="Time"
              className="h-9 shrink-0 w-[110px] rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <input
              type="number"
              min={5}
              max={120}
              step={5}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="Est"
              title="Estimate (minutes)"
              className="h-9 shrink-0 w-[90px] rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <select
              value={remind}
              onChange={(e) => setRemind(parseInt(e.target.value))}
              title="Remind"
              className="h-9 shrink-0 w-[110px] rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            >
              <option value={0}>No alert</option>
              <option value={5}>5m before</option>
              <option value={15}>15m before</option>
              <option value={30}>30m before</option>
              <option value={60}>1h before</option>
              <option value={120}>2h before</option>
              <option value={1440}>1 day before</option>
            </select>
            <button
              onClick={add}
              className="h-9 shrink-0 px-3 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Add
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-9 flex-1 rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-xl border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            title="Filter"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="med">Med</option>
            <option value="low">Low</option>
            <option value="today">Today</option>
            <option value="overdue">Overdue</option>
            <option value="missed">Missed</option>
          </select>
        </div>

        {/* To-do */}
        <Column
          title={`To-do (${todo.length})`}
          items={todo}
          onToggle={toggle}
          onRemove={remove}
          onUpdate={update}
          isOverdue={isOverdue}
          isToday={isToday}
          isMissed={isMissed}
          onStartTask={onStartTask}
          scrollMax={180}
          showFade={true}
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
            Done ({doneFiltered.length})
          </h3>
          {done.length > 0 && (
            <button
              onClick={() => setTodos(todos.filter((t) => !t.done))}
              className="h-8 text-xs px-2 rounded-lg bg-white border dark:bg-slate-900 dark:border-slate-700"
            >
              Clear done
            </button>
          )}
        </div>
        <Column
          title=""
          items={doneFiltered}
          onToggle={toggle}
          onRemove={remove}
          onUpdate={update}
          isOverdue={isOverdue}
          isToday={isToday}
          isMissed={isMissed}
          onStartTask={onStartTask}
          scrollMax={180}
          showFade={false}
        />
      </div>
    </div>
  );
}

function Column({
  title,
  items,
  onToggle,
  onRemove,
  onUpdate,
  isOverdue,
  isToday,
  isMissed,
  onStartTask,
  scrollMax = 180,
  showFade = true,
}) {
  // Local Chip (don't depend on global Pill)
  const Chip = ({ children, tone = "slate" }) => (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs " +
        (tone === "rose"
          ? "bg-rose-500/15 text-rose-300"
          : tone === "sky"
          ? "bg-sky-500/15 text-sky-300"
          : tone === "emerald"
          ? "bg-emerald-500/15 text-emerald-300"
          : tone === "amber"
          ? "bg-amber-500/15 text-amber-300"
          : "bg-slate-500/15 text-slate-300")
      }
    >
      {children}
    </span>
  );

  const prioTone = (p) =>
    p === "high" ? "rose" : p === "low" ? "emerald" : "amber";

  const Row = ({ item }) => {
    const [editing, setEditing] = useState(false);
    const [titleV, setTitleV] = useState(item.title);
    const [priorityV, setPriorityV] = useState(item.priority || "med");
    const [dueV, setDueV] = useState(item.due || "");
    const [timeV, setTimeV] = useState(item.time || "");
    const [remindV, setRemindV] = useState(
      typeof item.remindMins === "number" ? item.remindMins : 60
    );
    const [estimateV, setEstimateV] = useState(
      typeof item.estimateMins === "number" ? item.estimateMins : ""
    );

    const overdue = isOverdue(item.due);
    const today = isToday(item.due);
    const missed = isMissed(item);

    const save = () => {
      onUpdate?.(item.id, {
        title: titleV.trim() || item.title,
        priority: priorityV,
        due: dueV,
        time: timeV,
        remindMins: Number(remindV) || 0,
        estimateMins: estimateV ? Number(estimateV) : null,
      });
      setEditing(false);
    };

    return (
      <motion.li
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={
          "group rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm " +
          "px-3 py-2 hover:shadow-sm hover:bg-white/80 dark:hover:bg-slate-900/80 transition " +
          (missed ? "border-rose-400 ring-1 ring-rose-300/50" : "")
        }
      >
        {!editing ? (
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
            {/* Left priority stripe */}
            <span
              className={
                "h-7 w-1 rounded-full " +
                (item.priority === "high"
                  ? "bg-rose-400"
                  : item.priority === "low"
                  ? "bg-emerald-400"
                  : "bg-amber-400")
              }
            />
            {/* Content */}
            <div className="min-w-0">
              <label className="flex items-center gap-2 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => onToggle(item.id)}
                />
                <span
                  className={
                    "truncate font-medium " +
                    (item.done ? "line-through text-slate-400" : "")
                  }
                  title={item.title}
                >
                  {item.title}
                </span>
              </label>

              <div className="mt-1 flex items-center gap-1 flex-wrap text-xs">
                {today && <Chip tone="sky">Today</Chip>}
                {overdue && <Chip tone="rose">Overdue</Chip>}
                {missed && <Chip tone="rose">Missed</Chip>}
                {!today && !overdue && item.due && !missed && (
                  <Chip>{item.due.slice(5)}</Chip>
                )}
                {item.time && <Chip tone="sky">{item.time}</Chip>}
                {item.estimateMins ? <Chip>⏱ {item.estimateMins}m</Chip> : null}
                <Chip tone={prioTone(item.priority)}>
                  {item.priority === "high"
                    ? "High"
                    : item.priority === "low"
                    ? "Low"
                    : "Med"}
                </Chip>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!item.done && (
                <button
                  onClick={() => {
                    onStartTask?.(item);
                    onUpdate?.(item.id, { startedAt: Date.now() });
                  }}
                  className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Start
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                className="h-8 px-3 rounded-lg bg-white border text-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition
                           dark:bg-slate-900 dark:border-slate-700"
                title="Edit"
              >
                Edit
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="h-8 px-3 rounded-lg bg-white border text-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition
                           dark:bg-slate-900 dark:border-slate-700"
                title="Delete"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={titleV}
              onChange={(e) => setTitleV(e.target.value)}
              className="h-9 min-w-0 flex-[1_1_220px] rounded-lg border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <select
              value={priorityV}
              onChange={(e) => setPriorityV(e.target.value)}
              className="h-9 shrink-0 w-[92px] rounded-lg border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="high">High</option>
              <option value="med">Med</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              value={dueV}
              onChange={(e) => setDueV(e.target.value)}
              className="h-9 shrink-0 w-[130px] rounded-lg border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <input
              type="time"
              value={timeV}
              onChange={(e) => setTimeV(e.target.value)}
              className="h-9 shrink-0 w-[110px] rounded-lg border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <select
              value={remindV}
              onChange={(e) => setRemindV(parseInt(e.target.value))}
              className="h-9 shrink-0 w-[110px] rounded-lg border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            >
              <option value={0}>No alert</option>
              <option value={5}>5m</option>
              <option value={15}>15m</option>
              <option value={30}>30m</option>
              <option value={60}>1h</option>
              <option value={120}>2h</option>
              <option value={1440}>1 day</option>
            </select>
            <input
              type="number"
              min={5}
              max={120}
              step={5}
              value={estimateV}
              onChange={(e) => setEstimateV(e.target.value)}
              placeholder="Est"
              className="h-9 shrink-0 w-[90px] rounded-lg border px-3 bg-white dark:bg-slate-900 dark:border-slate-700"
            />
            <div className="ml-auto flex gap-2">
              <button
                onClick={save}
                className="h-9 px-3 rounded-lg bg-white border dark:bg-slate-900 dark:border-slate-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="h-9 px-3 rounded-lg bg-white border dark:bg-slate-900 dark:border-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </motion.li>
    );
  };

  return (
    <div>
      {title && (
        <h3 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
          {title}
        </h3>
      )}

      {/* Scroll container */}
      <div className="relative">
        <div
          className="overflow-y-auto pr-1 -mr-1 custom-scroll pb-4"
          style={{ maxHeight: `${scrollMax}px` }}
        >
          <ul className="space-y-2">
            {items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
            {items.length === 0 && (
              <li className="text-sm text-slate-400 dark:text-slate-500">
                Nothing here yet ✨
              </li>
            )}
          </ul>
        </div>

        {showFade && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-slate-100/90 dark:from-slate-800/90 to-transparent rounded-b-xl" />
        )}
      </div>
    </div>
  );
}

/* ===================== Pomodoro ===================== */
function Pomodoro({ pomo, setPomo, externalStartSignal, currentTask }) {
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(pomo.minutes * 60);
  const timerRef = useRef(0);

  // Sound
  const [volume, setVolume] = useState(load("ff.soundVol", 0.9));
  useEffect(() => save("ff.soundVol", volume), [volume]);
  const [melody, setMelody] = useState(load("ff.melody", "victory"));
  useEffect(() => save("ff.melody", melody), [melody]);

  // Autostart when external signal arrives
  useEffect(() => {
    if (!externalStartSignal) return;
    setSecondsLeft(pomo.minutes * 60);
    setRunning(true);
  }, [externalStartSignal, pomo.minutes]);

  // Tick every second when running
  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [running]);

  // Clean task name for history
  const baseName = (label) => {
    const s = String(label || "")
      .split("•")[0]
      .trim();
    return s || "Pomodoro";
  };

  // Session finish
  useEffect(() => {
    if (secondsLeft <= 0) {
      setRunning(false);
      setSecondsLeft(pomo.minutes * 60);

      const day = todayKey();
      const sessions = (pomo.sessions ?? 0) + 1;

      const entry = {
        day,
        mins: pomo.minutes,
        at: Date.now(),
        name: baseName(currentTask),
      };
      const newHistory = [...(pomo.history ?? []), entry];
      setPomo({ ...pomo, sessions, history: newHistory });

      playMelodyByName(ensureAudioContext(), melody, volume);
      if ("vibrate" in navigator) navigator.vibrate([200, 80, 200]);
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      toast.success(
        `Great job! +${pomo.minutes} min logged 🎉 (sessions: ${sessions})`,
        { duration: 4000 }
      );
      notify("Pomodoro done ✅", {
        body: `+${pomo.minutes} min logged • Sessions: ${sessions}`,
        silent: true,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      });

      if (sessions % 4 === 0)
        toast("Time for a longer break ☕️", { icon: "⏱️" });

      // Daily goal check
      const goal = load("ff.goalMins", 60);
      const todayTotal = sumTodayMinutes(newHistory);
      const hitKey = "ff.goalHit@" + day;
      if (todayTotal >= goal && localStorage.getItem(hitKey) !== "1") {
        localStorage.setItem(hitKey, "1");
        confetti({ particleCount: 180, spread: 80, origin: { y: 0.6 } });
        toast.success(`Daily goal reached: ${todayTotal} / ${goal} min 🏆`, {
          duration: 5000,
        });
        notify("Daily goal achieved 🏆", {
          body: `${todayTotal} / ${goal} minutes today`,
          silent: true,
        });
      }
    }
  }, [secondsLeft]); // eslint-disable-line

  const reset = () => {
    setRunning(false);
    setSecondsLeft(pomo.minutes * 60);
  };
  const inc = (d) =>
    setPomo({ ...pomo, minutes: Math.max(5, Math.min(60, pomo.minutes + d)) });

  const mm = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0");
  const ss = (secondsLeft % 60).toString().padStart(2, "0");

  // Hotkeys
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        ensureAudioContext();
        ensurePermission();
        setRunning((r) => !r);
      }
      if (e.key.toLowerCase() === "r") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-3">
      <div className="text-5xl font-bold tabular-nums text-center">
        {mm}:{ss}
      </div>
      {currentTask && (
        <div className="text-xs text-center text-slate-500 dark:text-slate-400">
          Now: {currentTask}
        </div>
      )}

      <div className="flex justify-center gap-2">
        <button
          onClick={async () => {
            ensureAudioContext();
            await ensurePermission();
            setRunning((r) => !r);
          }}
          className="h-9 px-3 rounded-xl bg-slate-900 text-white w-24 dark:bg-slate-100 dark:text-slate-900"
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={reset}
          className="h-9 px-3 rounded-xl bg-white border w-24 dark:bg-slate-900 dark:border-slate-700"
        >
          Reset
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm">
        <button
          onClick={() => inc(-5)}
          className="h-8 px-2 rounded-lg bg-white border dark:bg-slate-900 dark:border-slate-700"
        >
          −5m
        </button>
        <span className="text-slate-600 dark:text-slate-300">
          Length: {pomo.minutes}m
        </span>
        <button
          onClick={() => inc(5)}
          className="h-8 px-2 rounded-lg bg-white border dark:bg-slate-900 dark:border-slate-700"
        >
          +5m
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-40 accent-slate-900 dark:accent-slate-200"
          aria-label="Win sound volume"
        />
        <span>{Math.round(volume * 100)}%</span>
      </div>

      {/* Melody */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Melody</span>
        <select
          value={melody}
          onChange={(e) => setMelody(e.target.value)}
          className="h-8 rounded-lg border px-2 bg-white dark:bg-slate-900 dark:border-slate-700"
          aria-label="Win melody"
        >
          {Object.entries(MELODIES).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => playMelodyByName(ensureAudioContext(), melody, volume)}
          className="h-8 px-2 rounded-lg bg-white border dark:bg-slate-900 dark:border-slate-700"
        >
          Test
        </button>
      </div>

      <p className="text-xs text-center text-slate-500 dark:text-slate-400">
        Sessions: {pomo.sessions ?? 0}
      </p>
    </div>
  );
}

/* ===================== Habits ===================== */
function Habits({ habits, setHabits, onStartHabit }) {
  const [name, setName] = useState("");
  const [mins, setMins] = useState(15);

  const toggleDone = (id) => {
    const day = todayKey();
    setHabits(
      habits.map((h) => {
        if (h.id !== id) return h;
        const isNewDay = h.lastDone !== day;
        return {
          ...h,
          streak: isNewDay ? h.streak + 1 : h.streak,
          lastDone: day,
        };
      })
    );
  };
  const remove = (id) => setHabits(habits.filter((h) => h.id !== id));

  const add = () => {
    if (!name.trim()) return;
    const m = Math.max(5, Math.min(60, Number(mins) || 15));
    setHabits([
      { id: uid(), name: name.trim(), mins: m, streak: 0, lastDone: "" },
      ...habits,
    ]);
    setName("");
    setMins(15);
  };

  return (
    <div>
      {/* Input row */}
      <div className="flex gap-2 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New habit… (e.g., English)"
          className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 px-3 py-2
                     focus:outline-none focus:ring-2 focus:ring-slate-300
                     dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
        <input
          type="number"
          min={5}
          max={60}
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          className="w-20 rounded-xl border px-3 py-2 text-center dark:bg-slate-900 dark:border-slate-700"
          title="Minutes"
        />
        <button
          className="px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          onClick={add}
        >
          Add
        </button>
      </div>

      {/* Scroll list */}
      <div className="mt-3 -mr-2 pr-2 h-64 overflow-y-auto custom-scroll">
        <ul className="space-y-2">
          {habits.map((h) => (
            <li
              key={h.id}
              className="group flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2
                         border-slate-200 dark:bg-slate-900/60 dark:border-slate-700"
            >
              <div>
                <div className="font-medium">
                  {h.name} — <span className="text-slate-500">{h.mins}m</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Streak: {h.streak} day{h.streak === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onStartHabit?.(h)}
                  className="px-2 py-1 rounded-lg bg-white border text-sm dark:bg-slate-900 dark:border-slate-700"
                >
                  Start
                </button>
                <button
                  onClick={() => toggleDone(h.id)}
                  className="px-2 py-1 rounded-lg bg-white border text-sm dark:bg-slate-900 dark:border-slate-700"
                >
                  Done today
                </button>
                <button
                  onClick={() => remove(h.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-sm text-slate-500 dark:text-slate-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {habits.length === 0 && (
            <li className="text-sm text-slate-400 dark:text-slate-500">
              Add your first habit 🌱
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/* ===================== Tags helper for Daily Goal ===================== */
function inferTag(rawName) {
  const s = (rawName || "").toLowerCase();
  const CATS = [
    {
      keys: ["english", "англ"],
      label: "English",
      icon: "🇬🇧",
      cls: "bg-indigo-500/15 text-indigo-300",
    },
    {
      keys: ["read", "читан"],
      label: "Reading",
      icon: "📖",
      cls: "bg-amber-500/15 text-amber-300",
    },
    {
      keys: ["code", "coding", "програм", "js", "react"],
      label: "Code",
      icon: "💻",
      cls: "bg-emerald-500/15 text-emerald-300",
    },
    {
      keys: ["study", "learn", "навчан", "урок"],
      label: "Study",
      icon: "🎓",
      cls: "bg-sky-500/15 text-sky-300",
    },
    {
      keys: ["sport", "gym", "run", "yoga", "walk", "фіт", "спорт", "йога"],
      label: "Workout",
      icon: "🏃‍♀️",
      cls: "bg-rose-500/15 text-rose-300",
    },
    {
      keys: ["write", "пиш", "essay"],
      label: "Writing",
      icon: "✍️",
      cls: "bg-fuchsia-500/15 text-fuchsia-300",
    },
    {
      keys: ["music", "piano", "гит", "гіт", "спів"],
      label: "Music",
      icon: "🎵",
      cls: "bg-teal-500/15 text-teal-300",
    },
    {
      keys: ["cook", "кух", "готув"],
      label: "Cooking",
      icon: "🍳",
      cls: "bg-orange-500/15 text-orange-300",
    },
    {
      keys: ["clean", "приби", "cleaning"],
      label: "Cleaning",
      icon: "🧹",
      cls: "bg-slate-500/15 text-slate-300",
    },
  ];
  for (const c of CATS) if (c.keys.some((k) => s.includes(k))) return c;
  return null;
}

/* ===================== Daily Goal (timeline + badges) ===================== */
function DailyGoal({ pomo }) {
  const [goal, setGoal] = useState(load("ff.goalMins", 60));
  useEffect(() => save("ff.goalMins", goal), [goal]);

  const [view, setView] = useState("today"); // "today" | "yesterday" | "last7"

  const doneToday = sumTodayMinutes(pomo.history);
  const pct = Math.min(100, Math.round((doneToday / (goal || 1)) * 100));

  const sessions = useMemo(() => {
    const hist = pomo.history ?? [];
    const today = new Date();
    const key = (d) => new Date(d).toISOString().slice(0, 10);

    if (view === "today") {
      const k = key(today);
      return hist
        .filter((e) => e.day === k)
        .sort((a, b) => (b.at || 0) - (a.at || 0));
    }
    if (view === "yesterday") {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      const k = key(y);
      return hist
        .filter((e) => e.day === k)
        .sort((a, b) => (b.at || 0) - (a.at || 0));
    }
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return hist
      .filter((e) => {
        const d = new Date(e.day + "T00:00:00");
        return d >= start && d <= today;
      })
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [pomo.history, view]);

  const totalMins = sessions.reduce((s, e) => s + (e.mins || 0), 0);

  const fmtMeta = (e) => {
    const time = e.at
      ? new Date(e.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    if (view === "last7") return `${e.day.slice(5)}${time ? " • " + time : ""}`;
    return time;
  };

  return (
    <div className="space-y-4">
      {/* Header + progress */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold">Daily Goal</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {doneToday} / {goal} min
            </div>
          </div>

          <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
            <div
              className="h-full transition-all bg-gradient-to-r from-sky-500 to-indigo-500 dark:from-sky-400 dark:to-indigo-400"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>Goal:</span>
            <input
              type="range"
              min="15"
              max="240"
              step="15"
              value={goal}
              onChange={(e) => setGoal(parseInt(e.target.value))}
              className="w-48 accent-slate-900 dark:accent-slate-200"
            />
            <span>{goal}m</span>
          </div>
        </div>

        {/* View switch + total */}
        <div className="shrink-0 text-right">
          <div className="inline-flex rounded-xl border bg-slate-100 p-1 dark:bg-slate-900/60 dark:border-slate-700">
            {["today", "yesterday", "last7"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={
                  "px-3 py-1 text-xs rounded-lg transition " +
                  (view === v
                    ? "bg-white dark:bg-slate-800 shadow border dark:border-slate-700"
                    : "opacity-70 hover:opacity-100")
                }
              >
                {v === "today"
                  ? "Today"
                  : v === "yesterday"
                  ? "Yesterday"
                  : "Last 7"}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Total: <span className="font-medium">{totalMins}m</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
        <div className="pl-8 max-h-40 overflow-y-auto custom-scroll space-y-2">
          {sessions.length === 0 ? (
            <div className="text-sm text-slate-400 dark:text-slate-500">
              No sessions here — start one ⏱️
            </div>
          ) : (
            sessions.map((e) => {
              const name =
                e.name ||
                e.source ||
                (e.label ? String(e.label).split("•")[0].trim() : "") ||
                "Pomodoro";
              const tag = inferTag(name);
              return (
                <div
                  key={(e.at || Math.random()) + e.day}
                  className="relative rounded-xl border bg-slate-50 px-3 py-2 border-slate-200 dark:bg-slate-900/60 dark:border-slate-700"
                >
                  <div className="absolute -left-4 top-3 w-2 h-2 rounded-full bg-sky-400 ring-4 ring-sky-400/15" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {tag && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tag.cls}`}
                        >
                          <span>{tag.icon}</span>
                          {tag.label}
                        </span>
                      )}
                      <div className="font-medium truncate">{name}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {fmtMeta(e)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-700 dark:text-slate-200">
                        {e.mins}m
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Weekly Chart ===================== */
function WeeklyChart({ pomo }) {
  const data = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return {
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        mins: 0,
      };
    });
    (pomo.history ?? []).forEach((e) => {
      const idx = days.findIndex((d) => d.key === e.day);
      if (idx >= 0) days[idx].mins += e.mins;
    });
    return days;
  }, [pomo.history]);

  const dark = isDark();

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            stroke={dark ? "#334155" : "#e2e8f0"}
            strokeDasharray="3 3"
          />
          <XAxis dataKey="label" stroke={dark ? "#94a3b8" : "#64748b"} />
          <YAxis allowDecimals={false} stroke={dark ? "#94a3b8" : "#64748b"} />
          <Tooltip
            contentStyle={{
              background: dark ? "#0f172a" : "#ffffff",
              border: `1px solid ${isDark() ? "#334155" : "#e2e8f0"}`,
            }}
            labelStyle={{ color: dark ? "#e2e8f0" : "#0f172a" }}
            formatter={(v) => `${v} min`}
          />
          <Line
            type="monotone"
            dataKey="mins"
            stroke={dark ? "#60a5fa" : "#0ea5e9"}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
