import jwt from "jsonwebtoken";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (at least 32 characters)");
  return s;
};

export const signToken = (userId) => jwt.sign({ sub: String(userId) }, secret(), { expiresIn: "7d" });

// Express middleware: requires "Authorization: Bearer <token>"
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Please log in" });
  try {
    req.userId = jwt.verify(token, secret()).sub;
    next();
  } catch (err) {
    if (err.message.startsWith("JWT_SECRET")) {
      console.error(err.message);
      return res.status(500).json({ ok: false, error: "Server is not configured" });
    }
    res.status(401).json({ ok: false, error: "Session expired, please log in again" });
  }
}

// Wrap async handlers so thrown errors reach the error middleware
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
