import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateToken } from "../middleware/auth.js";
import { allowedCategories } from "../config/env.js";
import {
  isValidObjectId,
  isValidHttpsUrl,
  validateBookData,
} from "../utils/validation.js";

// ========================================
// BOOK ROUTES
// Exported as a factory so the MongoDB
// collections can be injected.
// Returns an Express Router.
// ========================================

export default function booksRoutes({ booksCollection, borrowsCollection }) {
  const router = Router();

  // ========================================
  // API 1: GET ALL BOOKS (PUBLIC)
  // GET /books
  // ========================================

  router.get("/", async (req, res) => {
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
  // GET /books/:id
  // ========================================

  router.get("/:id", authenticateToken, async (req, res) => {
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
  // POST /books
  // ========================================

  router.post("/", authenticateToken, async (req, res) => {
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

      const copies = Number(totalCopies ?? 1);

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
  // API 4: UPDATE BOOK (PROTECTED)
  // PATCH /books/:id
  // ========================================

  router.patch("/:id", authenticateToken, async (req, res) => {
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

      // Imported books (addedByEmail is null) can be
      // updated by any logged in user.
      const isOwner = existingBook.addedByEmail === req.user.email;
      const isImportedBook = existingBook.addedByEmail === null;

      if (!isOwner && !isImportedBook) {
        return res.status(403).json({
          success: false,
          message: "You cannot update another user's book.",
        });
      }

      const { title, author, category, image, description } = req.body;

      const updatedData = {};

      // Each provided field is validated before updating.

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({
            success: false,
            message: "Title cannot be empty.",
          });
        }

        updatedData.title = title.trim();
      }

      if (author !== undefined) {
        if (typeof author !== "string" || !author.trim()) {
          return res.status(400).json({
            success: false,
            message: "Author cannot be empty.",
          });
        }

        updatedData.author = author.trim();
      }

      if (description !== undefined) {
        if (typeof description !== "string" || !description.trim()) {
          return res.status(400).json({
            success: false,
            message: "Description cannot be empty.",
          });
        }

        updatedData.description = description.trim();
      }

      if (category !== undefined) {
        if (
          typeof category !== "string" ||
          !allowedCategories.includes(category)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid book category.",
          });
        }

        updatedData.category = category;
      }

      if (image !== undefined) {
        if (typeof image !== "string" || !image.trim()) {
          return res.status(400).json({
            success: false,
            message: "Image URL cannot be empty.",
          });
        }

        if (!isValidHttpsUrl(image)) {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid HTTPS image URL.",
          });
        }

        updatedData.image = image.trim();
      }

      if (Object.keys(updatedData).length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide at least one field to update (title, author, category, image, description).",
        });
      }

      updatedData.updatedAt = new Date();

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
  // API 5: DELETE BOOK (PROTECTED)
  // DELETE /books/:id
  // ========================================

  router.delete("/:id", authenticateToken, async (req, res) => {
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

      // Imported books (addedByEmail is null) can be
      // deleted by any logged in user.
      const isOwner = existingBook.addedByEmail === req.user.email;
      const isImportedBook = existingBook.addedByEmail === null;

      if (!isOwner && !isImportedBook) {
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

  return router;
}
