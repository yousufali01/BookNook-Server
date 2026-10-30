import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";

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

// Must match BetterAuth's BETTER_AUTH_URL exactly.
const AUTH_BASE_URL = process.env.AUTH_BASE_URL?.replace(/\/+$/, "");

if (!AUTH_BASE_URL) {
  throw new Error("AUTH_BASE_URL is not configured in .env");
}

const client = new MongoClient(uri);

const allowedCategories = ["Fiction", "Science", "History", "Kids", "Others"];

// BetterAuth JWKS public key endpoint
const JWKS = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/auth/jwks`));

// ========================================
// HELPER FUNCTIONS
// ========================================

const isValidObjectId = (id) => ObjectId.isValid(id);

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const validateBookData = (data) => {
  const { title, author, category, image, description } = data;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof author !== "string" ||
    !author.trim() ||
    typeof category !== "string" ||
    typeof image !== "string" ||
    !image.trim() ||
    typeof description !== "string" ||
    !description.trim()
  ) {
    return "Please provide all required book information.";
  }

  if (!allowedCategories.includes(category)) {
    return "Invalid book category.";
  }

  try {
    const parsedImageUrl = new URL(image.trim());

    if (parsedImageUrl.protocol !== "https:") {
      return "Please provide a valid HTTPS image URL.";
    }
  } catch {
    return "Please provide a valid image URL.";
  }

  return null;
};

// ========================================
// JWT AUTHENTICATION MIDDLEWARE
// ========================================

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please login.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "JWT token is missing.",
      });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_BASE_URL,
      audience: AUTH_BASE_URL,
    });

    const email = normalizeEmail(payload.email);

    if (!email || typeof payload.sub !== "string") {
      return res.status(401).json({
        success: false,
        message: "Invalid user information in token.",
      });
    }

    // Verified identity from JWT, not from request body/query.
    req.user = {
      id: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name : "",
    };

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please login again.",
    });
  }
};

// ========================================
// SERVER
// ========================================

async function run() {
  try {
    await client.connect();

    console.log("MongoDB Connected Successfully!");

    const db = client.db(process.env.MONGODB_DB || "BookNook");

    const booksCollection = db.collection("BookNook");
    const borrowsCollection = db.collection("borrows");

    console.log("Connected Database:", db.databaseName);
    console.log("Total Books:", await booksCollection.countDocuments());
    console.log("Total Borrows:", await borrowsCollection.countDocuments());

    // ========================================
    // ROOT ROUTE
    // ========================================

    app.get("/", (req, res) => {
      res.send("BookNook Server is Running!");
    });

    // ========================================
    // API 1: GET ALL BOOKS (PUBLIC)
    // GET /api/books
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
    // API 2: GET SINGLE BOOK (PROTECTED)
    // GET /api/books/:id
    // ========================================

    app.get("/api/books/:id", authenticateToken, async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book ID.",
          });
        }

        const book = await booksCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!book) {
          return res.status(404).json({
            success: false,
            message: "Book not found.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Book fetched successfully.",
          data: book,
        });
      } catch (error) {
        console.error("Get Single Book Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch book.",
        });
      }
    });

    // ========================================
    // API 3: ADD NEW BOOK (PROTECTED)
    // POST /api/books
    // ========================================

    app.post("/api/books", authenticateToken, async (req, res) => {
      try {
        const { title, author, category, image, description } = req.body;

        const validationError = validateBookData(req.body);

        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }

        if (!req.user.name) {
          return res.status(400).json({
            success: false,
            message: "Your account name is missing.",
          });
        }

        const newBook = {
          title: title.trim(),
          author: author.trim(),
          category,
          image: image.trim(),
          description: description.trim(),

          // Always use verified JWT identity.
          addedByName: req.user.name,
          addedByEmail: req.user.email,

          createdAt: new Date(),
          updatedAt: null,
        };

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
    // API 4: GET MY BOOKS (PROTECTED)
    // GET /api/my-books
    // ========================================

    app.get("/api/my-books", authenticateToken, async (req, res) => {
      try {
        const books = await booksCollection
          .find({ addedByEmail: req.user.email })
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json({
          success: true,
          message: "Your books fetched successfully.",
          data: books,
        });
      } catch (error) {
        console.error("Get My Books Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch your books.",
        });
      }
    });

    // ========================================
    // API 5: UPDATE BOOK (PROTECTED)
    // PUT /api/books/:id
    // ========================================

    app.put("/api/books/:id", authenticateToken, async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book ID.",
          });
        }

        const validationError = validateBookData(req.body);

        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }

        const existingBook = await booksCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existingBook) {
          return res.status(404).json({
            success: false,
            message: "Book not found.",
          });
        }

        if (existingBook.addedByEmail !== req.user.email) {
          return res.status(403).json({
            success: false,
            message: "You cannot update another user's book.",
          });
        }

        const { title, author, category, image, description } = req.body;

        const updatedData = {
          title: title.trim(),
          author: author.trim(),
          category,
          image: image.trim(),
          description: description.trim(),
          updatedAt: new Date(),
        };

        await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData },
        );

        const updatedBook = await booksCollection.findOne({
          _id: new ObjectId(id),
        });

        return res.status(200).json({
          success: true,
          message: "Book updated successfully!",
          data: updatedBook,
        });
      } catch (error) {
        console.error("Update Book Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update book.",
        });
      }
    });

    // ========================================
    // API 6: DELETE BOOK (PROTECTED)
    // DELETE /api/books/:id
    // ========================================

    app.delete("/api/books/:id", authenticateToken, async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book ID.",
          });
        }

        const existingBook = await booksCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existingBook) {
          return res.status(404).json({
            success: false,
            message: "Book not found.",
          });
        }

        if (existingBook.addedByEmail !== req.user.email) {
          return res.status(403).json({
            success: false,
            message: "You cannot delete another user's book.",
          });
        }

        await booksCollection.deleteOne({
          _id: new ObjectId(id),
        });

        return res.status(200).json({
          success: true,
          message: "Book deleted successfully!",
        });
      } catch (error) {
        console.error("Delete Book Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to delete book.",
        });
      }
    });

    // ========================================
    // API 7: BORROW A BOOK (PROTECTED)
    // POST /api/borrows
    // ========================================

    app.post("/api/borrows", authenticateToken, async (req, res) => {
      try {
        const { bookId } = req.body;

        if (!bookId || !isValidObjectId(bookId)) {
          return res.status(400).json({
            success: false,
            message: "Valid book ID is required.",
          });
        }

        const book = await booksCollection.findOne({
          _id: new ObjectId(bookId),
        });

        if (!book) {
          return res.status(404).json({
            success: false,
            message: "Book not found.",
          });
        }

        // Prevent duplicate active borrow of the same book.
        const existingBorrow = await borrowsCollection.findOne({
          bookId: book._id.toString(),
          userEmail: req.user.email,
          isReturned: false,
        });

        if (existingBorrow) {
          return res.status(409).json({
            success: false,
            message: "You have already borrowed this book.",
          });
        }

        const borrowDate = new Date();

        const returnDate = new Date(borrowDate);
        returnDate.setDate(returnDate.getDate() + 14);

        const newBorrow = {
          bookId: book._id.toString(),
          bookTitle: book.title,
          bookImage: book.image,

          // Always use verified JWT identity.
          userName: req.user.name,
          userEmail: req.user.email,

          borrowDate,
          returnDate,
          isReturned: false,
          returnedAt: null,
          createdAt: new Date(),
        };

        const result = await borrowsCollection.insertOne(newBorrow);

        return res.status(201).json({
          success: true,
          message: "Book borrowed successfully!",
          data: {
            _id: result.insertedId,
            ...newBorrow,
          },
        });
      } catch (error) {
        console.error("Borrow Book Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to borrow book.",
        });
      }
    });

    // ========================================
    // API 8: GET MY BORROWS (PROTECTED)
    // GET /api/borrows
    // ========================================

    app.get("/api/borrows", authenticateToken, async (req, res) => {
      try {
        const borrows = await borrowsCollection
          .find({ userEmail: req.user.email })
          .sort({ borrowDate: -1 })
          .toArray();

        return res.status(200).json({
          success: true,
          message: "Borrow history fetched successfully.",
          data: borrows,
        });
      } catch (error) {
        console.error("Get Borrows Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch borrow history.",
        });
      }
    });

    // ========================================
    // API 9: RETURN A BOOK (PROTECTED)
    // PUT /api/borrows/:id/return
    // ========================================

    app.put("/api/borrows/:id/return", authenticateToken, async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid borrow ID.",
          });
        }

        const existingBorrow = await borrowsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existingBorrow) {
          return res.status(404).json({
            success: false,
            message: "Borrow record not found.",
          });
        }

        if (existingBorrow.userEmail !== req.user.email) {
          return res.status(403).json({
            success: false,
            message: "You cannot return another user's borrowed book.",
          });
        }

        if (existingBorrow.isReturned) {
          return res.status(400).json({
            success: false,
            message: "This book has already been returned.",
          });
        }

        await borrowsCollection.updateOne(
          {
            _id: new ObjectId(id),
            userEmail: req.user.email,
            isReturned: false,
          },
          {
            $set: {
              isReturned: true,
              returnedAt: new Date(),
            },
          },
        );

        const updatedBorrow = await borrowsCollection.findOne({
          _id: new ObjectId(id),
        });

        return res.status(200).json({
          success: true,
          message: "Book returned successfully!",
          data: updatedBorrow,
        });
      } catch (error) {
        console.error("Return Book Error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to return book.",
        });
      }
    });

    // ========================================
    // GLOBAL ERROR HANDLER
    // ========================================

    app.use((error, req, res, next) => {
      console.error("Backend Error:", error);

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
      console.log(`JWT Issuer: ${AUTH_BASE_URL}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
  }
}

run();
