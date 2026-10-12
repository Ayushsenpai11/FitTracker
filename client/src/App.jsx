
import React, { useEffect, useState, useCallback } from "react";

const API_URL = "https://fittracker-api-bzjs.onrender.com/api";

const initialWorkout = {
  exercise: "",
  duration: "",
  calories: "",
  date: new Date().toISOString().slice(0, 10),
};

export default function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("fittrack_token") || ""
  );
  const [user, setUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState({
    totalWorkouts: 0,
    totalMinutes: 0,
    totalCalories: 0,
  });

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [workoutForm, setWorkoutForm] = useState(initialWorkout);
  const [editingId, setEditingId] = useState(null);

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Request failed");
      }

      return data;
    },
    [token]
  );

  const loadDashboard = useCallback(async () => {
    const [profileData, workoutData, dashboardData] = await Promise.all([
      apiRequest("/profile"),
      apiRequest("/workouts"),
      apiRequest("/dashboard"),
    ]);

    setUser(profileData.user);
    setWorkouts(workoutData.workouts);
    setSummary(dashboardData.summary);
  }, [apiRequest]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function loadData() {
      try {
        const [profileData, workoutData, dashboardData] =
          await Promise.all([
            apiRequest("/profile"),
            apiRequest("/workouts"),
            apiRequest("/dashboard"),
          ]);

        if (cancelled) return;

        setUser(profileData.user);
        setWorkouts(workoutData.workouts);
        setSummary(dashboardData.summary);
        setError("");
      } catch (err) {
        if (cancelled) return;

        localStorage.removeItem("fittrack_token");
        setToken("");
        setUser(null);
        setError(err.message);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [token, apiRequest]);

  function handleAuthChange(event) {
    const { name, value } = event.target;

    setAuthForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleWorkoutChange(event) {
    const { name, value } = event.target;

    setWorkoutForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const endpoint =
        mode === "register" ? "/register" : "/login";

      const data = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(authForm),
      });

      if (mode === "register") {
        setMode("login");
        setAuthForm({
          name: "",
          email: authForm.email,
          password: "",
        });
        setMessage("Account created successfully. Please log in.");
      } else {
        localStorage.setItem("fittrack_token", data.token);
        setToken(data.token);
        setUser(data.user);
        setMessage("Welcome to FitTrack!");
        setAuthForm({ name: "", email: "", password: "" });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleWorkoutSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const duration = Number(workoutForm.duration);
    const calories = Number(workoutForm.calories || 0);

    if (
      !Number.isInteger(duration) ||
      duration < 0 ||
      !Number.isInteger(calories) ||
      calories < 0
    ) {
      setError("Duration and calories must be non-negative whole numbers.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...workoutForm,
        duration,
        calories,
      };

      if (editingId !== null) {
        await apiRequest(`/workouts/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("Workout updated successfully!");
      } else {
        await apiRequest("/workouts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Workout added successfully!");
      }

      setWorkoutForm(initialWorkout);
      setEditingId(null);
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(workout) {
    setWorkoutForm({
      exercise: workout.exercise,
      duration: String(workout.duration),
      calories: String(workout.calories),
      date: workout.date,
    });
    setEditingId(workout.id);
    setError("");
    setMessage("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteWorkout(id) {
    if (!window.confirm("Are you sure you want to delete this workout?")) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await apiRequest(`/workouts/${id}`, { method: "DELETE" });
      await loadDashboard();
      setMessage("Workout deleted successfully!");

      if (editingId === id) {
        cancelEdit();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setWorkoutForm(initialWorkout);
  }

  function handleLogout() {
    localStorage.removeItem("fittrack_token");
    setToken("");
    setUser(null);
    setWorkouts([]);
    setSummary({
      totalWorkouts: 0,
      totalMinutes: 0,
      totalCalories: 0,
    });
    setAuthForm({ name: "", email: "", password: "" });
    setError("");
    setMessage("");
    setMode("login");
    cancelEdit();
  }

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f3f6fb",
      fontFamily: "Arial, sans-serif",
      color: "#172033",
    },
    header: {
      background: "#14213d",
      color: "#fff",
      padding: "20px 6%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    main: {
      width: "88%",
      maxWidth: 1100,
      margin: "30px auto",
    },
    card: {
      background: "#fff",
      padding: 22,
      borderRadius: 14,
      boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
      marginBottom: 22,
    },
    input: {
      display: "block",
      width: "100%",
      boxSizing: "border-box",
      padding: 12,
      marginTop: 6,
      marginBottom: 16,
      border: "1px solid #d7deea",
      borderRadius: 8,
      fontSize: 15,
    },
    button: {
      padding: "11px 17px",
      background: "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      cursor: "pointer",
      fontWeight: "bold",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 16,
    },
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={{ margin: 0 }}>💪 FitTrack</h1>
          <small>Your fitness, your progress.</small>
        </div>

        {token && (
          <button style={styles.button} onClick={handleLogout}>
            Logout
          </button>
        )}
      </header>

      <main style={styles.main}>
        {(error || message) && (
          <div
            role="status"
            style={{
              ...styles.card,
              color: error ? "#b91c1c" : "#15803d",
              padding: 14,
            }}
          >
            {error || message}
          </div>
        )}

        {!token ? (
          <section
            style={{
              ...styles.card,
              maxWidth: 440,
              margin: "40px auto",
            }}
          >
            <h2>
              {mode === "login" ? "Welcome Back" : "Create Account"}
            </h2>

            <p>
              {mode === "login"
                ? "Log in to track your fitness journey."
                : "Create an account to get started."}
            </p>

            <form onSubmit={handleAuthSubmit}>
              {mode === "register" && (
                <>
                  <label htmlFor="name">Full name</label>
                  <input
                    id="name"
                    style={styles.input}
                    name="name"
                    value={authForm.name}
                    onChange={handleAuthChange}
                    autoComplete="name"
                    required
                  />
                </>
              )}

              <label htmlFor="email">Email address</label>
              <input
                id="email"
                style={styles.input}
                name="email"
                type="email"
                value={authForm.email}
                onChange={handleAuthChange}
                autoComplete="email"
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                style={styles.input}
                name="password"
                type="password"
                minLength={6}
                value={authForm.password}
                onChange={handleAuthChange}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />

              <button
                type="submit"
                style={{
                  ...styles.button,
                  opacity: loading ? 0.7 : 1,
                }}
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : mode === "login"
                    ? "Login"
                    : "Register"}
              </button>
            </form>

            <p>
              {mode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                  setMessage("");
                }}
                style={{
                  border: "none",
                  background: "none",
                  color: "#2563eb",
                  cursor: "pointer",
                }}
              >
                {mode === "login" ? "Register" : "Login"}
              </button>
            </p>
          </section>
        ) : (
          <>
            <section style={styles.card}>
              <h2>Hello, {user?.name || "Fitness Enthusiast"}! 👋</h2>
              <p>Keep moving. Every workout counts.</p>
              <small>{user?.email}</small>
            </section>

            <section style={styles.grid}>
              {[
                {
                  title: "Total Workouts",
                  value: summary.totalWorkouts,
                  unit: "",
                  icon: "🏋️",
                },
                {
                  title: "Active Minutes",
                  value: summary.totalMinutes,
                  unit: "min",
                  icon: "⏱️",
                },
                {
                  title: "Calories Burned",
                  value: summary.totalCalories,
                  unit: "kcal",
                  icon: "🔥",
                },
              ].map((item) => (
                <div key={item.title} style={styles.card}>
                  <div style={{ fontSize: 27 }}>{item.icon}</div>
                  <p>{item.title}</p>
                  <h2 style={{ marginBottom: 0 }}>
                    {item.value} {item.unit}
                  </h2>
                </div>
              ))}
            </section>

            <section style={styles.card}>
              <h2>{editingId !== null ? "Edit Workout" : "Add Workout"}</h2>

              <form onSubmit={handleWorkoutSubmit}>
                <label htmlFor="exercise">Exercise name</label>
                <input
                  id="exercise"
                  style={styles.input}
                  name="exercise"
                  placeholder="e.g. Running, Cycling, Push-ups"
                  value={workoutForm.exercise}
                  onChange={handleWorkoutChange}
                  required
                />

                <div style={styles.grid}>
                  <div>
                    <label htmlFor="duration">Duration (minutes)</label>
                    <input
                      id="duration"
                      style={styles.input}
                      name="duration"
                      type="number"
                      min="0"
                      step="1"
                      value={workoutForm.duration}
                      onChange={handleWorkoutChange}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="calories">Calories burned (kcal)</label>
                    <input
                      id="calories"
                      style={styles.input}
                      name="calories"
                      type="number"
                      min="0"
                      step="1"
                      value={workoutForm.calories}
                      onChange={handleWorkoutChange}
                    />
                  </div>
                </div>

                <label htmlFor="date">Workout date</label>
                <input
                  id="date"
                  style={styles.input}
                  name="date"
                  type="date"
                  value={workoutForm.date}
                  onChange={handleWorkoutChange}
                  required
                />

                <button
                  type="submit"
                  style={styles.button}
                  disabled={loading}
                >
                  {loading
                    ? "Saving..."
                    : editingId !== null
                      ? "Update Workout"
                      : "+ Add Workout"}
                </button>

                {editingId !== null && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{
                      ...styles.button,
                      background: "#64748b",
                      marginLeft: 10,
                    }}
                  >
                    Cancel
                  </button>
                )}
              </form>
            </section>

            <section style={styles.card}>
              <h2>Workout History</h2>

              {workouts.length === 0 ? (
                <p>No workouts yet. Add your first workout above!</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr>
                        {[
                          "Exercise",
                          "Duration",
                          "Calories",
                          "Date",
                          "Actions",
                        ].map((heading) => (
                          <th
                            key={heading}
                            style={{
                              padding: 12,
                              borderBottom: "2px solid #e5e7eb",
                            }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {workouts.map((workout) => (
                        <tr key={workout.id}>
                          <td style={{ padding: 12 }}>
                            {workout.exercise}
                          </td>
                          <td style={{ padding: 12 }}>
                            {workout.duration} min
                          </td>
                          <td style={{ padding: 12 }}>
                            {workout.calories} kcal
                          </td>
                          <td style={{ padding: 12 }}>{workout.date}</td>
                          <td style={{ padding: 12, whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={() => handleEdit(workout)}
                              style={{
                                ...styles.button,
                                background: "#0f766e",
                                marginRight: 6,
                              }}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteWorkout(workout.id)}
                              style={{
                                ...styles.button,
                                background: "#dc2626",
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
