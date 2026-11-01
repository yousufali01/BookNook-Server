import { createApp } from "./app.js";
import { connectDB, client } from "./config/db.js";
import { PORT, AUTH_BASE_URL } from "./config/env.js";

// ========================================
// SERVER ENTRY POINT
// 1. Connect to MongoDB
// 2. Create the Express app
// 3. Start listening
// ========================================

async function main() {
  try {
    const collections = await connectDB();

    const app = createApp(collections);

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`JWT Issuer: ${AUTH_BASE_URL}`);
    });

    // ========================================
    // GRACEFUL SHUTDOWN
    // Stop listening, then close MongoDB.
    // ========================================

    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down...`);

      server.close(async () => {
        await client.close();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}

main();
