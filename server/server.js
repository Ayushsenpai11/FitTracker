
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from your .env file");
}

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Initialize SQLite database
const db = new Database("fittrack.db");
db.pragma("foreign_keys = ON");

// Create database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exercise TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    calories INTEGER NOT NULL DEFAULT 0,
    date TEXT NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      message: "Please log in to continue",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        message: "Invalid or expired token. Please log in again.",
      });
    }

    req.user = decoded;
    next();
  });
}

// Validate workout input
function validateWorkout(body) {
  const exercise =
    typeof body.exercise === "string" ? body.exercise.trim() : "";

  const duration = Number(body.duration);
  const calories = Number(body.calories ?? 0);
  const date = body.date || new Date().toISOString().slice(0, 10);

  if (!exercise || exercise.length > 100) {
    return { error: "Exercise name is required (maximum 100 characters)" };
  }

  if (
    !Number.isInteger(duration) ||
    duration < 0 ||
    duration > 1440
  ) {
    return { error: "Duration must be a whole number from 0 to 1440" };
  }

  if (
    !Number.isInteger(calories) ||
    calories < 0 ||
    calories > 100000
  ) {
    return { error: "Calories must be a non-negative whole number" };
  }

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return { error: "Date must use YYYY-MM-DD format" };
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return { error: "Please enter a valid date" };
  }

  return { workout: { exercise, duration, calories, date } };
}

// Health check
app.get("/", (req, res) => {
  res.json({ message: "FitTrack API is running successfully" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

// Register a new user
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 6 ||
      password.length > 72
    ) {
      return res.status(400).json({
        message:
          "Enter a valid name and email. Password must be 6–72 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (existing) {
      return res.status(409).json({
        message: "This email is already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (name, email, password)
      VALUES (?, ?, ?)
    `).run(name.trim(), normalizedEmail, hashedPassword);

    return res.status(201).json({
      message: "Registration successful",
      user: {
        id: Number(result.lastInsertRowid),
        name: name.trim(),
        email: normalizedEmail,
      },
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "This email is already registered",
      });
    }

    console.error("Registration error:", error);
    return res.status(500).json({
      message: "Registration failed",
    });
  }
});

// Log in
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = db.prepare(`
      SELECT id, name, email, password
      FROM users
      WHERE email = ?
    `).get(email.trim().toLowerCase());

    if (
      !user ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Login failed",
    });
  }
});

// Get current user's profile
app.get("/api/profile", authenticateToken, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({ user });
});

// Get current user's workouts
app.get("/api/workouts", authenticateToken, (req, res) => {
  const workouts = db.prepare(`
    SELECT id, user_id, exercise, duration, calories, date
    FROM workouts
    WHERE user_id = ?
    ORDER BY date DESC, id DESC
  `).all(req.user.id);

  res.json({ workouts });
});

// Add a workout
app.post("/api/workouts", authenticateToken, (req, res) => {
  const validation = validateWorkout(req.body);

  if (validation.error) {
    return res.status(400).json({
      message: validation.error,
    });
  }

  const { exercise, duration, calories, date } =
    validation.workout;

  const result = db.prepare(`
    INSERT INTO workouts
      (user_id, exercise, duration, calories, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    exercise,
    duration,
    calories,
    date
  );

  const workout = db.prepare(`
    SELECT id, user_id, exercise, duration, calories, date
    FROM workouts
    WHERE id = ? AND user_id = ?
  `).get(Number(result.lastInsertRowid), req.user.id);

  res.status(201).json({
    message: "Workout added successfully",
    workout,
  });
});

// Update a workout
app.put("/api/workouts/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      message: "Invalid workout ID",
    });
  }

  const validation = validateWorkout(req.body);

  if (validation.error) {
    return res.status(400).json({
      message: validation.error,
    });
  }

  const { exercise, duration, calories, date } =
    validation.workout;

  const result = db.prepare(`
    UPDATE workouts
    SET exercise = ?, duration = ?, calories = ?, date = ?
    WHERE id = ? AND user_id = ?
  `).run(
    exercise,
    duration,
    calories,
    date,
    id,
    req.user.id
  );

  if (result.changes === 0) {
    return res.status(404).json({
      message: "Workout not found",
    });
  }

  const workout = db.prepare(`
    SELECT id, user_id, exercise, duration, calories, date
    FROM workouts
    WHERE id = ? AND user_id = ?
  `).get(id, req.user.id);

  res.json({
    message: "Workout updated successfully",
    workout,
  });
});

// Delete a workout
app.delete("/api/workouts/:id", authenticateToken, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      message: "Invalid workout ID",
    });
  }

  const result = db.prepare(`
    DELETE FROM workouts
    WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({
      message: "Workout not found",
    });
  }

  res.json({
    message: "Workout deleted successfully",
  });
});

// Dashboard summary
app.get("/api/dashboard", authenticateToken, (req, res) => {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS totalWorkouts,
      COALESCE(SUM(duration), 0) AS totalMinutes,
      COALESCE(SUM(calories), 0) AS totalCalories
    FROM workouts
    WHERE user_id = ?
  `).get(req.user.id);

  res.json({ summary });
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    message: "API route not found",
  });
});

// General error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    message: "Internal server error",
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`FitTrack server running at http://localhost:${PORT}`);
});

// Graceful shutdown
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

