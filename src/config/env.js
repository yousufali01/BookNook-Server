import "dotenv/config";

// ========================================
// ENVIRONMENT CONFIGURATION
// Loaded once when the app starts.
// ========================================

export const PORT = process.env.PORT || 5000;

export const MONGODB_URI = process.env.MONGODB_URI;

export const MONGODB_DB = process.env.MONGODB_DB || "BookNook";

export const AUTH_BASE_URL = process.env.AUTH_BASE_URL?.replace(/\/+$/, "");

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not configured in .env");
}

if (!AUTH_BASE_URL) {
  throw new Error("AUTH_BASE_URL is not configured in .env");
}

export const allowedCategories = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",

  // Extra categories found in existing imported books
  // (The Silent Patient, Atomic Habits, etc.)
  "Mystery",
  "Self Help",
  "Classic",
  "Finance",
];
