import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

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

const allowedCategories = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
];

// ========================================
// HELPER FUNCTIONS
// ========================================

const isValidObjectId = (id) => ObjectId.isValid(id);

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const validateBookData = (data) => {
  const {
    title,
    author,
    category,
    image,
    description,
  } = data;

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
    console.log(
      "Total Borrows:",
      await borrowsCollection.countDocuments()
    );

    // ========================================
    // ROOT ROUTE
    // ========================================

    app.get("/", (req, res) => {
      res.send("BookNook Server is Running!");
    });

    // ========================================
    // API 1: GET ALL BOOKS
    // GET /api/books
    // ========================================

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
    // API 2: GET SINGLE BOOK
    // GET /api/books/:id
    // ========================================

    app.get("/api/books/:id", async (req, res) => {
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
    // API 3: ADD NEW BOOK
    // POST /api/books
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

        const validationError = validateBookData(req.body);

        if (
          validationError ||
          typeof addedByName !== "string" ||
          !addedByName.trim() ||
          !normalizeEmail(addedByEmail)
        ) {
          return res.status(400).json({
            success: false,
            message:
              validationError ||
              "Please provide valid user information.",
          });
        }

        const newBook = {
          title: title.trim(),
          author: author.trim(),
          category,
          image: image.trim(),
          description: description.trim(),
          addedByName: addedByName.trim(),
          addedByEmail: normalizeEmail(addedByEmail),
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
    // API 4: GET MY BOOKS
    // GET /api/my-books?email=user@email.com
    // ========================================

    app.get("/api/my-books", async (req, res) => {
      try {
        const email = normalizeEmail(req.query.email);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "User email is required.",
          });
        }

        const books = await booksCollection
          .find({ addedByEmail: email })
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
    // API 5: UPDATE BOOK
    // PUT /api/books/:id
    // ========================================

    app.put("/api/books/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const {
          title,
          author,
          category,
          image,
          description,
          addedByEmail,
        } = req.body;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book ID.",
          });
        }

        const email = normalizeEmail(addedByEmail);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "User email is required.",
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

        if (existingBook.addedByEmail !== email) {
          return res.status(403).json({
            success: false,
            message: "You cannot update another user's book.",
          });
        }

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
          { $set: updatedData }
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
    // API 6: DELETE BOOK
    // DELETE /api/books/:id?email=user@email.com
    // ========================================

    app.delete("/api/books/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const email = normalizeEmail(req.query.email);

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book ID.",
          });
        }

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "User email is required.",
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

        if (existingBook.addedByEmail !== email) {
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
    // API 7: BORROW A BOOK
    // POST /api/borrows
    // ========================================

    app.post("/api/borrows", async (req, res) => {
      try {
        const { bookId, userName, userEmail } = req.body;

        const email = normalizeEmail(userEmail);

        if (!bookId || !isValidObjectId(bookId)) {
          return res.status(400).json({
            success: false,
            message: "Valid book ID is required.",
          });
        }

        if (!email || typeof userName !== "string" || !userName.trim()) {
          return res.status(400).json({
            success: false,
            message: "Valid user information is required.",
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

        // Prevent duplicate active borrow of the same book
        const existingBorrow = await borrowsCollection.findOne({
          bookId: book._id.toString(),
          userEmail: email,
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
          userName: userName.trim(),
          userEmail: email,
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
    // API 8: GET MY BORROWS
    // GET /api/borrows?email=user@email.com
    // ========================================

    app.get("/api/borrows", async (req, res) => {
      try {
        const email = normalizeEmail(req.query.email);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "User email is required.",
          });
        }

        const borrows = await borrowsCollection
          .find({ userEmail: email })
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
    // API 9: RETURN A BOOK
    // PUT /api/borrows/:id/return
    // ========================================

    app.put("/api/borrows/:id/return", async (req, res) => {
      try {
        const { id } = req.params;
        const email = normalizeEmail(req.body.userEmail);

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid borrow ID.",
          });
        }

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "User email is required.",
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

        if (existingBorrow.userEmail !== email) {
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
          { _id: new ObjectId(id) },
          {
            $set: {
              isReturned: true,
              returnedAt: new Date(),
            },
          }
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
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
  }
}

run();
