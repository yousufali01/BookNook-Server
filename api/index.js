import { connectDB } from "../src/config/db.js";
import { createApp } from "../src/app.js";

// ========================================
// VERCEL SERVERLESS ENTRY POINT
// Local development runs through src/index.js,
// production on Vercel runs through this handler.
//
// The app is created lazily once, then reused
// across warm invocations (faster cold starts).
// ========================================

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = connectDB()
      .then((collections) => createApp(collections))
      .catch((error) => {
        // Reset so the next request can try again.
        appPromise = null;
        throw error;
      });
  }

  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();

    // An Express app is a request handler function,
    // so it can be called directly.
    return app(req, res);
  } catch (error) {
    console.error("Serverless Handler Error:", error);

    return res.status(500).json({
      success: false,
      message: "Database connection failed. Please try again.",
    });
  }
}
