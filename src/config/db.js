import { MongoClient } from "mongodb";
import { MONGODB_URI, MONGODB_DB } from "./env.js";

export const client = new MongoClient(MONGODB_URI);

// ========================================
// MIGRATE OLD BOOKS
// Old books did not have totalCopies.
// Give them one available copy by default.
// ========================================

async function migrateOldBooks(booksCollection) {
  const migrationResult = await booksCollection.updateMany(
    { totalCopies: { $exists: false } },
    { $set: { totalCopies: 1 } },
  );

  console.log(
    "Old books updated with default copies:",
    migrationResult.modifiedCount,
  );
}

// ========================================
// PREVENT DOUBLE ACTIVE BORROWS
// One user can have only one active borrow
// for the same book.
// ========================================

async function createBorrowSafetyIndex(borrowsCollection) {
  await borrowsCollection.createIndex(
    { bookId: 1, userEmail: 1 },
    {
      unique: true,
      partialFilterExpression: { isReturned: false },
      name: "unique_active_borrow_per_user_book",
    },
  );

  console.log("Borrow safety index ready.");
}

// ========================================
// BACKFILL IMPORTED BOOKS
// Books added manually (through Compass
// etc.) are missing ownership and update
// fields. addedByEmail stays null — that
// means any logged in user may update
// or delete them.
// ========================================

async function backfillImportedBooks(booksCollection) {
  const backfillResult = await booksCollection.updateMany(
    {
      $or: [
        { addedByName: { $exists: false } },
        { addedByEmail: { $exists: false } },
        { updatedAt: { $exists: false } },
      ],
    },
    {
      $set: {
        addedByName: "BookNook Admin",
        addedByEmail: null,
        updatedAt: null,
      },
    },
  );

  if (backfillResult.modifiedCount > 0) {
    console.log(
      "Imported books backfilled with ownership fields:",
      backfillResult.modifiedCount,
    );
  }
}

// ========================================
// DATABASE CONNECTION
// Returns { db, booksCollection, borrowsCollection }
// ========================================

export async function connectDB() {
  await client.connect();

  console.log("MongoDB Connected Successfully!");

  const db = client.db(MONGODB_DB);

  const booksCollection = db.collection("BookNook");
  const borrowsCollection = db.collection("borrows");

  console.log("Connected Database:", db.databaseName);

  await migrateOldBooks(booksCollection);
  await backfillImportedBooks(booksCollection);
  await createBorrowSafetyIndex(borrowsCollection);

  console.log("Total Books:", await booksCollection.countDocuments());
  console.log("Total Borrows:", await borrowsCollection.countDocuments());

  return { db, booksCollection, borrowsCollection };
}
