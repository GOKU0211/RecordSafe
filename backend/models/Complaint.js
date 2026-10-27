const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema({
  complaintNumber: { type: String, unique: true, index: true },
  citizen: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  incidentDate: { type: Date, default: null },
  incidentLocation: { type: String, trim: true, maxlength: 300 },
  category: { type: String, trim: true, maxlength: 100 },
  status: {
    type: String,
    enum: ["Submitted", "UnderReview", "InformationRequested", "Referred", "FIRRegistered", "UnderInvestigation", "Closed"],
    default: "Submitted",
    index: true
  },
  firNumber: { type: String, default: null },
  assignedInvestigator: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  evidence: [{
    originalName: String,
    storageName: String,
    mimeType: String,
    size: Number,
    sha256: String
  }],
  blockchain: {
    complaintIdHash: String,
    contentHash: String,
    transactionHash: String,
    network: String
  },
  statusHistory: [{
    status: String,
    note: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model("Complaint", complaintSchema);
