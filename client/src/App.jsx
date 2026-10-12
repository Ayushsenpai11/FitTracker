import { useCallback, useEffect, useMemo, useState } from "react";
import "./index.css";

const API_URL = "https://fittracker-api-bzjs.onrender.com/api";
const blankWorkout = () => ({ exercise: "", duration: "", calories: "", date: new Date().toISOString().slice(0, 10) });
const blankSummary = { totalWorkouts: 0, totalMinutes: 0, totalCalories: 0 };

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function lastSevenDays(workouts) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - i));
    const key = localDateKey(date);
    const matching = workouts.filter((w) => w.date === key);
    return {
      key,
      label: date.toLocaleDateString("en", { weekday: "short" }),
      minutes: matching.reduce((sum, w) => sum + Number(w.duration || 0), 0),
    };
  });
}
function prettyDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("fittrack_token") || "");
  const [user, setUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState(blankSummary);
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [workoutForm, setWorkoutForm] = useState(blankWorkout);
  const [editingId, setEditingId] = useState(null);
  const [activeNav, setActiveNav] = useState("dashboard");

  const apiRequest = useCallback(async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new Error("Could not reach the server. Please try again in a moment.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }, [token]);

  const loadDashboard = useCallback(async () => {
    const [profile, workoutData, dashboard] = await Promise.all([
      apiRequest("/profile"), apiRequest("/workouts"), apiRequest("/dashboard"),
    ]);
    setUser(profile.user);
    setWorkouts(Array.isArray(workoutData.workouts) ? workoutData.workouts : []);
    setSummary(dashboard.summary || blankSummary);
  }, [apiRequest]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [profile, workoutData, dashboard] = await Promise.all([
          apiRequest("/profile"), apiRequest("/workouts"), apiRequest("/dashboard"),
        ]);
        if (cancelled) return;
        setUser(profile.user);
        setWorkouts(Array.isArray(workoutData.workouts) ? workoutData.workouts : []);
        setSummary(dashboard.summary || blankSummary);
        setError("");
      } catch (err) {
        if (cancelled) return;
        localStorage.removeItem("fittrack_token");
        setToken("");
        setUser(null);
        setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [token, apiRequest]);

  const week = useMemo(() => lastSevenDays(workouts), [workouts]);
  const maxMinutes = Math.max(30, ...week.map((day) => day.minutes));

  function handleAuthChange(e) {
    setAuthForm((old) => ({ ...old, [e.target.name]: e.target.value }));
  }
  function handleWorkoutChange(e) {
    setWorkoutForm((old) => ({ ...old, [e.target.name]: e.target.value }));
  }
  async function handleAuthSubmit(e) {
    e.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const data = await apiRequest(mode === "register" ? "/register" : "/login", {
        method: "POST", body: JSON.stringify(authForm),
      });
      if (mode === "register") {
        setMode("login");
        setAuthForm({ name: "", email: authForm.email, password: "" });
        setMessage("Account created successfully. Please log in.");
      } else {
        localStorage.setItem("fittrack_token", data.token);
        setToken(data.token); setUser(data.user);
        setAuthForm({ name: "", email: "", password: "" });
        setMessage("Welcome to FitTrack!");
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function handleWorkoutSubmit(e) {
    e.preventDefault(); setError(""); setMessage("");
    const duration = Number(workoutForm.duration);
    const calories = Number(workoutForm.calories || 0);
    if (!workoutForm.exercise.trim() || !Number.isInteger(duration) || duration < 0 || duration > 1440 ||
        !Number.isInteger(calories) || calories < 0 || calories > 100000) {
      setError("Enter an exercise, a duration from 0–1440 minutes, and valid calories."); return;
    }
    setLoading(true);
    try {
      const payload = { ...workoutForm, exercise: workoutForm.exercise.trim(), duration, calories };
      if (editingId !== null) {
        await apiRequest(`/workouts/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setMessage("Workout updated successfully.");
      } else {
        await apiRequest("/workouts", { method: "POST", body: JSON.stringify(payload) });
        setMessage("Workout added successfully.");
      }
      setWorkoutForm(blankWorkout()); setEditingId(null); await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  function handleEdit(workout) {
    setWorkoutForm({ exercise: workout.exercise, duration: String(workout.duration), calories: String(workout.calories), date: workout.date });
    setEditingId(workout.id); setError(""); setMessage("");
    document.getElementById("add-workout")?.scrollIntoView({ behavior: "smooth" });
  }
  async function handleDeleteWorkout(id) {
    if (!window.confirm("Are you sure you want to delete this workout?")) return;
    setError(""); setMessage("");
    try {
      await apiRequest(`/workouts/${id}`, { method: "DELETE" });
      await loadDashboard(); setMessage("Workout deleted successfully.");
      if (editingId === id) cancelEdit();
    } catch (err) { setError(err.message); }
  }
  function cancelEdit() { setEditingId(null); setWorkoutForm(blankWorkout()); }
  function handleLogout() {
    localStorage.removeItem("fittrack_token"); setToken(""); setUser(null); setWorkouts([]);
    setSummary(blankSummary); setAuthForm({ name: "", email: "", password: "" });
    setError(""); setMessage(""); setMode("login"); cancelEdit();
  }
  function goTo(id) {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#dashboard" onClick={() => setActiveNav("dashboard")}>
        <span className="brand-mark">✦</span><span><strong>FitTrack</strong><small>Your fitness, your progress.</small></span>
      </a>
      {token ? <div className="topbar-actions"><span className="online-pill"><i /> Ready to move</span><button className="button button-quiet" onClick={handleLogout}>Log out</button></div> : <span className="secure-note">Your personal fitness space</span>}
    </header>

    <main className="page-content">
      {(error || message) && <div className={`notice ${error ? "notice-error" : "notice-success"}`} role="status">
        <span>{error ? "!" : "✓"}</span><p>{error || message}</p>
        <button className="notice-dismiss" aria-label="Dismiss message" onClick={() => { setError(""); setMessage(""); }}>×</button>
      </div>}

      {!token ? <section className="auth-layout">
        <div className="auth-promo">
          <span className="eyebrow">YOUR JOURNEY STARTS HERE</span>
          <h1>Small steps.<br /><span>Stronger you.</span></h1>
          <p>Build healthy habits, track every session, and celebrate your progress one workout at a time.</p>
          <div className="promo-points"><div><b>✓</b> Personal workout tracking</div><div><b>✓</b> Progress at a glance</div><div><b>✓</b> Your fitness journey, organized</div></div>
          <div className="orb orb-one" /><div className="orb orb-two" />
        </div>
        <section className="glass-panel auth-card">
          <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span>
          <h2>{mode === "login" ? "Sign in to FitTrack" : "Create your account"}</h2>
          <p className="muted">{mode === "login" ? "Pick up where you left off." : "Your fitness journey starts with one step."}</p>
          <form onSubmit={handleAuthSubmit}>
            {mode === "register" && <label>Full name<input name="name" value={authForm.name} onChange={handleAuthChange} autoComplete="name" placeholder="Your name" maxLength={100} required /></label>}
            <label>Email address<input name="email" type="email" value={authForm.email} onChange={handleAuthChange} autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Password<input name="password" type="password" minLength={6} value={authForm.password} onChange={handleAuthChange} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 6 characters" required /></label>
            <button className="button button-primary button-wide" type="submit" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}</button>
          </form>
          <p className="auth-switch">{mode === "login" ? "New to FitTrack?" : "Already have an account?"}
            <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "Create account" : "Sign in"}</button>
          </p>
        </section>
      </section> : <>
        <nav className="section-nav" aria-label="Main navigation">
          <button className={activeNav === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => goTo("dashboard")}>▦ <span>Dashboard</span></button>
          <button className={activeNav === "weekly-activity" ? "nav-link active" : "nav-link"} onClick={() => goTo("weekly-activity")}>↗ <span>Activity</span></button>
          <button className={activeNav === "add-workout" ? "nav-link active" : "nav-link"} onClick={() => goTo("add-workout")}>＋ <span>Add workout</span></button>
          <button className={activeNav === "workout-history" ? "nav-link active" : "nav-link"} onClick={() => goTo("workout-history")}>◷ <span>History</span></button>
          <div className="nav-spacer" /><span className="user-chip"><i>{(user?.name || "F").slice(0, 1).toUpperCase()}</i>{user?.name || "Fitness user"}</span>
        </nav>

        <section className="hero-panel glass-panel" id="dashboard">
          <div className="hero-copy"><span className="eyebrow">YOUR PERSONAL DASHBOARD</span>
            <h1>Hello, {user?.name || "Fitness enthusiast"} <span className="wave">👋</span></h1>
            <p>Keep moving. Every workout counts.</p><span className="hero-email">{user?.email}</span>
          </div>
          <div className="hero-decoration" aria-hidden="true"><div className="hero-ring" /><div className="hero-ring ring-two" /><div className="hero-bolt">↗</div></div>
          <div className="hero-bottom"><i /> Your progress, all in one place</div>
        </section>

        <section className="stats-grid" aria-label="Fitness summary">
          <article className="stat-card glass-panel"><div className="stat-top"><span className="stat-icon icon-teal">↗</span><span className="stat-trend">LIFETIME</span></div><p>Total workouts</p><h2>{summary.totalWorkouts ?? 0}</h2><small>Sessions completed</small></article>
          <article className="stat-card glass-panel"><div className="stat-top"><span className="stat-icon icon-blue">◷</span><span className="stat-trend">LIFETIME</span></div><p>Active minutes</p><h2>{summary.totalMinutes ?? 0}<span> min</span></h2><small>Time spent moving</small></article>
          <article className="stat-card glass-panel"><div className="stat-top"><span className="stat-icon icon-orange">ϟ</span><span className="stat-trend">LIFETIME</span></div><p>Calories burned</p><h2>{summary.totalCalories ?? 0}<span> kcal</span></h2><small>Energy logged</small></article>
        </section>

        <section className="content-grid">
          <section className="glass-panel chart-panel" id="weekly-activity">
            <div className="panel-heading"><div><span className="eyebrow">CONSISTENCY COUNTS</span><h2>Weekly activity</h2></div><span className="heading-badge">LAST 7 DAYS</span></div>
            <div className="chart-summary"><strong>{week.reduce((sum, day) => sum + day.minutes, 0)} <span>min</span></strong><span>recorded this week</span></div>
            <div className="activity-chart" role="img" aria-label="Active minutes for the last seven days">
              {week.map((day) => <div className="chart-day" key={day.key}><span className="chart-value">{day.minutes || "—"}</span><div className="bar-track"><div className="bar-fill" style={{ height: `${day.minutes ? Math.max(8, day.minutes / maxMinutes * 100) : 3}%` }} /></div><span className="chart-day-label">{day.label}</span></div>)}
            </div>
            <p className="chart-footnote">Bars show workout minutes logged each day.</p>
          </section>

          <section className="glass-panel quick-panel" id="add-workout">
            <div className="panel-heading"><div><span className="eyebrow">LOG YOUR SESSION</span><h2>{editingId !== null ? "Edit workout" : "Add workout"}</h2></div><span className="panel-symbol">＋</span></div>
            <form onSubmit={handleWorkoutSubmit} className="workout-form">
              <label>Exercise name<input name="exercise" value={workoutForm.exercise} onChange={handleWorkoutChange} placeholder="e.g. Running, cycling, push-ups" maxLength={100} required /></label>
              <div className="form-row">
                <label>Duration (min)<input name="duration" type="number" min="0" max="1440" step="1" value={workoutForm.duration} onChange={handleWorkoutChange} placeholder="30" required /></label>
                <label>Calories (kcal)<input name="calories" type="number" min="0" max="100000" step="1" value={workoutForm.calories} onChange={handleWorkoutChange} placeholder="200" /></label>
              </div>
              <label>Workout date<input name="date" type="date" value={workoutForm.date} onChange={handleWorkoutChange} required /></label>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={loading}>{loading ? "Saving…" : editingId !== null ? "Save changes →" : "＋ Add workout"}</button>{editingId !== null && <button className="button button-secondary" type="button" onClick={cancelEdit}>Cancel</button>}</div>
            </form>
          </section>
        </section>

        <section className="glass-panel history-panel" id="workout-history">
          <div className="panel-heading"><div><span className="eyebrow">YOUR JOURNEY SO FAR</span><h2>Workout history</h2></div><span className="heading-badge">{workouts.length} {workouts.length === 1 ? "SESSION" : "SESSIONS"}</span></div>
          {workouts.length === 0 ? <div className="empty-state"><span className="empty-icon">✦</span><h3>Your first win starts here</h3><p>Add a workout and your activity will appear here.</p><button className="button button-primary" onClick={() => goTo("add-workout")}>Log a workout</button></div> :
            <div className="table-wrap"><table className="workout-table"><thead><tr><th>Exercise</th><th>Duration</th><th>Calories</th><th>Date</th><th>Actions</th></tr></thead><tbody>
              {workouts.map((workout) => <tr key={workout.id}><td><span className="exercise-mark">✦</span><strong>{workout.exercise}</strong></td><td>{workout.duration} min</td><td>{workout.calories} kcal</td><td>{prettyDate(workout.date)}</td><td className="table-actions"><button className="button button-small button-secondary" onClick={() => handleEdit(workout)}>Edit</button><button className="button button-small button-danger" onClick={() => handleDeleteWorkout(workout.id)}>Delete</button></td></tr>)}
            </tbody></table></div>}
        </section>
        <footer className="app-footer"><span className="footer-brand">✦ FitTrack</span><span>Progress, not perfection.</span><button className="footer-link" onClick={() => goTo("dashboard")}>Back to top ↑</button></footer>
      </>}
    </main>
  </div>;
}
