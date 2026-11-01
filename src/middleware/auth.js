import { createRemoteJWKSet, jwtVerify } from "jose";
import { AUTH_BASE_URL } from "../config/env.js";
import { normalizeEmail } from "../utils/validation.js";

const JWKS = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/auth/jwks`));

// ========================================
// JWT AUTHENTICATION MIDDLEWARE
// Bearer token is verified against the
// auth server's JWKS. The verified payload
// is attached to req.user.
// ========================================

export const authenticateToken = async (req, res, next) => {
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
