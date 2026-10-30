import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import multer from "multer";

dotenv.config();

const app = express();

// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// CONFIGURATION
// ========================================

const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not configured in .env");
}

const client = new MongoClient(uri);

const allowedCategories = ["Fiction", "Science", "History", "Kids", "Others"];

// ========================================
// MULTER IMAGE UPLOAD CONFIGURATION
// ========================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  },
});

// ========================================
// SERVER
// ========================================

async function run() {
  try {
    // Connect MongoDB
    await client.connect();

    console.log("MongoDB Connected Successfully!");

    // Database and Collection
    const db = client.db(process.env.MONGODB_DB || "BookNook");

    const booksCollection = db.collection("BookNook");

    console.log("Connected Database:", db.databaseName);

    console.log("Available Collections:", await db.listCollections().toArray());

    console.log("Total Books:", await booksCollection.countDocuments());

    // ========================================
    // ROOT ROUTE
    // ========================================

    app.get("/", (req, res) => {
      res.send("BookNook Server is Running!");
    });

    // ========================================
    // API 1: UPLOAD BOOK IMAGE
    // ========================================

    app.post("/api/upload-image", upload.single("image"), async (req, res) => {
      try {
        // Check selected image
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "Please select an image.",
          });
        }

        // Get ImgBB API Key
        const apiKey = process.env.IMGBB_API_KEY;

        if (!apiKey) {
          console.error("ERROR: IMGBB_API_KEY is missing in Backend .env");

          return res.status(500).json({
            success: false,
            message: "Image upload service is not configured.",
          });
        }

        console.log("Starting ImgBB Image Upload...");
        console.log("Image Name:", req.file.originalname);
        console.log("Image Size:", req.file.size);

        // Convert image buffer to Base64
        const base64Image = req.file.buffer.toString("base64");

        // Prepare request body
        const imageFormData = new URLSearchParams();

        imageFormData.append("image", base64Image);

        // Send image to ImgBB
        const imageResponse = await fetch(
          `https://api.imgbb.com/1/upload?key=${apiKey}`,
          {
            method: "POST",
            body: imageFormData,
          },
        );

        // Read response as text first
        const responseText = await imageResponse.text();
        // Handle ImgBB server errors
        if (imageResponse.status === 503) {
          console.error("ImgBB Server is currently under maintenance.");

          return res.status(503).json({
            success: false,
            message:
              "Image hosting service is temporarily unavailable. Please try again later.",
          });
        }

        console.log("ImgBB Response Status:", imageResponse.status);

        console.log(
          "ImgBB Content Type:",
          imageResponse.headers.get("content-type"),
        );

        // Parse JSON safely
        let imageResult;

        try {
          imageResult = JSON.parse(responseText);
        } catch (parseError) {
          console.error("ImgBB returned an invalid JSON response.");

          // Print a limited response preview
          console.error("ImgBB Response Preview:", responseText.slice(0, 1000));

          return res.status(502).json({
            success: false,
            message:
              "ImgBB returned an invalid response. Check Backend Terminal.",
          });
        }

        // Check ImgBB upload status
        if (!imageResponse.ok || !imageResult.success) {
          console.error("ImgBB Upload Failed:", imageResult);

          return res.status(400).json({
            success: false,
            message: imageResult.error?.message || "ImgBB image upload failed.",
          });
        }

        // Check uploaded image URL
        const imageUrl = imageResult.data?.url;

        if (!imageUrl) {
          console.error(
            "ImgBB response does not contain an image URL:",
            imageResult,
          );

          return res.status(502).json({
            success: false,
            message: "Uploaded image URL was not found.",
          });
        }

        console.log("Image Uploaded Successfully!");
        console.log("Image URL:", imageUrl);

        // Send image URL to frontend
        return res.status(200).json({
          success: true,
          message: "Image uploaded successfully.",
          data: {
            url: imageUrl,
          },
        });
      } catch (error) {
        console.error("Image Upload Error:", error);

        return res.status(500).json({
          success: false,
          message: error.message || "Failed to upload image.",
        });
      }
    });

    // ========================================
    // API 2: GET ALL BOOKS
    // ========================================

    app.get("/api/books", async (req, res) => {
      try {
        const requestedLimit = Number.parseInt(req.query.limit, 10);

        let query = booksCollection.find().sort({ createdAt: -1, _id: -1 });

        if (Number.isInteger(requestedLimit) && requestedLimit > 0) {
          query = query.limit(Math.min(requestedLimit, 100));
        }

        const books = await query.toArray();

        return res.status(200).json({
          success: true,
          message: "Books fetched successfully.",
          data: books,
        });
      } catch (error) {
        console.error("Get Books Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch books.",
        });
      }
    });

    // ========================================
    // API 3: ADD NEW BOOK
    // ========================================

    app.post("/api/books", async (req, res) => {
      try {
        const {
          title,
          author,
          category,
          image,
          description,
          addedByName,
          addedByEmail,
        } = req.body;

        // Required field validation
        if (
          typeof title !== "string" ||
          !title.trim() ||
          typeof author !== "string" ||
          !author.trim() ||
          typeof category !== "string" ||
          typeof image !== "string" ||
          !image.trim() ||
          typeof description !== "string" ||
          !description.trim() ||
          typeof addedByName !== "string" ||
          !addedByName.trim() ||
          typeof addedByEmail !== "string" ||
          !addedByEmail.trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "Please provide all required book information.",
          });
        }

        // Category validation
        if (!allowedCategories.includes(category)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book category.",
          });
        }

        // Create book document
        const newBook = {
          title: title.trim(),
          author: author.trim(),
          category,
          image: image.trim(),
          description: description.trim(),
          addedByName: addedByName.trim(),
          addedByEmail: addedByEmail.trim().toLowerCase(),
          createdAt: new Date(),
        };

        // Save book to MongoDB
        const result = await booksCollection.insertOne(newBook);

        return res.status(201).json({
          success: true,
          message: "Book added successfully!",
          data: {
            _id: result.insertedId,
            ...newBook,
          },
        });
      } catch (error) {
        console.error("Add Book Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to add book.",
        });
      }
    });

    // ========================================
    // GLOBAL ERROR HANDLER
    // ========================================

    app.use((error, req, res, next) => {
      console.error("Backend Error:", error);

      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error.",
      });
    });

    // ========================================
    // START SERVER
    // ========================================

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
  }
}

// ========================================
// RUN SERVER
// ========================================

run();
