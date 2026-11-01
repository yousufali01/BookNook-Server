import express from "express";
import cors from "cors";
import booksRoutes from "./routes/books.routes.js";
import borrowsRoutes from "./routes/borrows.routes.js";

// ========================================
// EXPRESS APP FACTORY
// Collections are injected so the app
// can be created only after the database
// connection is ready.
// ========================================

export function createApp(collections) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ========================================
  // ROOT ROUTE
  // ========================================

  app.get("/", (req, res) => {
    res.send("BookNook Server is Running!");
  });

  // ========================================
  // API ROUTES (8 REQUIRED ROUTES)
  // ========================================

  app.use("/books", booksRoutes(collections));
  app.use("/borrows", borrowsRoutes(collections));

  // ========================================
  // 404 HANDLER FOR UNKNOWN ROUTES
  // ========================================

  app.use((req, res) => {
    return res.status(404).json({
      success: false,
      message: "Route not found.",
    });
  });

  // ========================================
  // GLOBAL ERROR HANDLER
  // ========================================

  app.use((error, req, res, next) => {
    console.error("Backend Error:", error);

    const status = error.status || error.statusCode || 500;

    return res.status(status).json({
      success: false,
      message:
        status === 400 && /json/i.test(error.message)
          ? "Invalid JSON format in request body."
          : error.message || "Internal Server Error.",
    });
  });

  return app;
}
