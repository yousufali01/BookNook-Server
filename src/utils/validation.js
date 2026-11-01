import { ObjectId } from "mongodb";
import { allowedCategories } from "../config/env.js";

export const isValidObjectId = (id) => ObjectId.isValid(id);

export const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

// ========================================
// FULL BOOK VALIDATION
// Used when adding a new book.
// Returns an error message or null.
// ========================================

export const validateBookData = (data) => {
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

  if (!isValidHttpsUrl(image)) {
    return image.trim()
      ? "Please provide a valid HTTPS image URL."
      : "Please provide a valid image URL.";
  }

  return null;
};

// ========================================
// IMAGE URL CHECK
// ========================================

export const isValidHttpsUrl = (url) => {
  try {
    const parsedImageUrl = new URL(url.trim());

    return parsedImageUrl.protocol === "https:";
  } catch {
    return false;
  }
};
