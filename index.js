
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not configured in .env");
}

const client = new MongoClient(uri);

async function run() {
  try {
    // Connect MongoDB
    await client.connect();
    console.log("MongoDB Connected Successfully!");

    // Database and Collection
    const db = client.db("BookNook");
    const booksCollection = db.collection("BookNook");

    console.log("Connected Database:", db.databaseName);
    console.log(
      "Available Collections:",
      await db.listCollections().toArray()
    );

    console.log(
      "Total Books:",
      await booksCollection.countDocuments()
    );

    // Root Route
    app.get("/", (req, res) => {
      res.send("BookNook Server is Running!");
    });

    // GET All Books / Latest Books
    app.get("/api/books", async (req, res) => {
      try {
        const requestedLimit = Number.parseInt(req.query.limit, 10);

        let query = booksCollection
          .find()
          .sort({ createdAt: -1, _id: -1 });

        if (Number.isInteger(requestedLimit) && requestedLimit > 0) {
          query = query.limit(Math.min(requestedLimit, 100));
        }

        const books = await query.toArray();

        res.status(200).json({
          success: true,
          message: "Books fetched successfully",
          data: books,
        });
      } catch (error) {
        console.error("Get Books Error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to fetch books",
        });
      }
    });

    // Start Server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
  }
}

run();
