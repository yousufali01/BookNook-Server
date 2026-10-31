import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";

dotenv.config();

const app = express();

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

const AUTH_BASE_URL = process.env.AUTH_BASE_URL?.replace(/\/+$/, "");

if (!AUTH_BASE_URL) {
  throw new Error("AUTH_BASE_URL is not configured in .env");
}

const client = new MongoClient(uri);

const allowedCategories = ["Fiction", "Science", "History", "Kids", "Others"];

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

    // ========================================
    // MIGRATE OLD BOOKS
    // Old books did not have totalCopies.
    // Give them one available copy by default.
    // ========================================

    const migrationResult = await booksCollection.updateMany(
      { totalCopies: { $exists: false } },
      { $set: { totalCopies: 1 } },
    );

    console.log(
      "Old books updated with default copies:",
      migrationResult.modifiedCount,
    );

    // ========================================
    // PREVENT DOUBLE ACTIVE BORROWS
    // One user can have only one active borrow
    // for the same book.
    // ========================================

    await borrowsCollection.createIndex(
      { bookId: 1, userEmail: 1 },
      {
        unique: true,
        partialFilterExpression: { isReturned: false },
        name: "unique_active_borrow_per_user_book",
      },
    );

    console.log("Borrow safety index ready.");

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
        const { title, author, category, image, description, totalCopies } =
          req.body;

        const validationError = validateBookData(req.body);

        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }

        const copies = Number(totalCopies);

        if (!Number.isInteger(copies) || copies < 1 || copies > 10000) {
          return res.status(400).json({
            success: false,
            message: "Total copies must be a whole number between 1 and 10000.",
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

          // Available copies
          totalCopies: copies,

          // Verified identity from JWT
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

        // Do not delete a book that is currently borrowed.
        const activeBorrow = await borrowsCollection.findOne({
          bookId: id,
          isReturned: false,
        });

        if (activeBorrow) {
          return res.status(409).json({
            success: false,
            message: "This book cannot be deleted while it is borrowed.",
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

        const bookObjectId = new ObjectId(bookId);

        const book = await booksCollection.findOne({
          _id: bookObjectId,
        });

        if (!book) {
          return res.status(404).json({
            success: false,
            message: "Book not found.",
          });
        }

        // Prevent an already active duplicate borrow.
        const existingBorrow = await borrowsCollection.findOne({
          bookId: bookId,
          userEmail: req.user.email,
          isReturned: false,
        });

        if (existingBorrow) {
          return res.status(409).json({
            success: false,
            message: "You have already borrowed this book.",
          });
        }

        // Atomically reserve one available copy.
        const stockResult = await booksCollection.updateOne(
          {
            _id: bookObjectId,
            totalCopies: { $gt: 0 },
          },
          {
            $inc: { totalCopies: -1 },
          },
        );

        if (stockResult.modifiedCount !== 1) {
          return res.status(409).json({
            success: false,
            message: "This book is currently not available.",
          });
        }

        const borrowDate = new Date();

        const returnDate = new Date(borrowDate);
        returnDate.setDate(returnDate.getDate() + 14);

        const newBorrow = {
          bookId: book._id.toString(),
          bookTitle: book.title,
          bookImage: book.image,

          userName: req.user.name,
          userEmail: req.user.email,

          borrowDate,
          returnDate,
          isReturned: false,
          returnedAt: null,
          createdAt: new Date(),
        };

        try {
          const result = await borrowsCollection.insertOne(newBorrow);

          return res.status(201).json({
            success: true,
            message: "Book borrowed successfully!",
            data: {
              _id: result.insertedId,
              ...newBorrow,
            },
          });
        } catch (insertError) {
          // Restore stock if saving the borrow record fails.
          await booksCollection.updateOne(
            { _id: bookObjectId },
            { $inc: { totalCopies: 1 } },
          );

          if (insertError.code === 11000) {
            return res.status(409).json({
              success: false,
              message: "You have already borrowed this book.",
            });
          }

          throw insertError;
        }
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

        const borrowObjectId = new ObjectId(id);

        const existingBorrow = await borrowsCollection.findOne({
          _id: borrowObjectId,
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

        // Mark this borrow as returned only once.
        const returnTime = new Date();

        const returnResult = await borrowsCollection.updateOne(
          {
            _id: borrowObjectId,
            userEmail: req.user.email,
            isReturned: false,
          },
          {
            $set: {
              isReturned: true,
              returnedAt: returnTime,
            },
          },
        );

        if (returnResult.modifiedCount !== 1) {
          return res.status(409).json({
            success: false,
            message: "This book has already been returned.",
          });
        }

        // Restore one available copy.
        if (isValidObjectId(existingBorrow.bookId)) {
          await booksCollection.updateOne(
            { _id: new ObjectId(existingBorrow.bookId) },
            { $inc: { totalCopies: 1 } },
          );
        }

        const updatedBorrow = await borrowsCollection.findOne({
          _id: borrowObjectId,
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
    process.exit(1);
  }
}

run();
