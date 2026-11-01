import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateToken } from "../middleware/auth.js";
import { isValidObjectId } from "../utils/validation.js";

// ========================================
// BORROW ROUTES
// Exported as a factory so the MongoDB
// collections can be injected.
// Returns an Express Router.
// ========================================

export default function borrowsRoutes({ booksCollection, borrowsCollection }) {
  const router = Router();

  // ========================================
  // API 6: BORROW A BOOK (PROTECTED)
  // POST /borrows
  // ========================================

  router.post("/", authenticateToken, async (req, res) => {
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
  // API 7: GET MY BORROWS (PROTECTED)
  // GET /borrows
  // ========================================

  router.get("/", authenticateToken, async (req, res) => {
    try {
      const borrows = await borrowsCollection
        .find({ userEmail: req.user.email })
        .sort({ borrowDate: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        message: "Borrows fetched successfully.",
        data: borrows,
      });
    } catch (error) {
      console.error("Get Borrows Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch borrows.",
      });
    }
  });

  // ========================================
  // API 8: RETURN A BOOK (PROTECTED)
  // DELETE /borrows/:id
  // ========================================

  router.delete("/:id", authenticateToken, async (req, res) => {
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

      // Remove this active borrow only once.
      const deleteResult = await borrowsCollection.deleteOne({
        _id: borrowObjectId,
        userEmail: req.user.email,
        isReturned: false,
      });

      if (deleteResult.deletedCount !== 1) {
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

      return res.status(200).json({
        success: true,
        message: "Book returned successfully!",
        data: existingBorrow,
      });
    } catch (error) {
      console.error("Return Book Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to return book.",
      });
    }
  });

  return router;
}
