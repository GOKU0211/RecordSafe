require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const complaintRoutes = require("./routes/complaint.routes");

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));

app.get("/", (_req, res) => res.json({ name: "RecordSafe API", status: "running" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "RecordSafe API" }));
app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
});

const port = Number(process.env.PORT || 5000);
async function start() {
  if (process.env.MONGODB_URI) {
    try { await connectDB(); }
    catch (error) {
      console.error("MongoDB connection failed:", error.message);
      console.error("API will not start without the database. Check MONGODB_URI and ensure MongoDB is running.");
      process.exit(1);
    }
  } else {
    console.error("MONGODB_URI is missing. Add it to backend/.env");
    process.exit(1);
  }
  app.listen(port, () => console.log(`RecordSafe API running at http://localhost:${port}`));
}
start();
