const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["citizen", "police", "admin"], default: "citizen" },
  policeRole: { type: String, enum: ["reviewing_officer", "investigator", "supervisor"], default: undefined },
  stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
