const crypto = require("crypto");
const Complaint = require("../models/Complaint");

function hashText(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

exports.create = async (req, res, next) => {
  try {
    const { title, description, incidentDate, incidentLocation, category } = req.body;
    if (!title || !description) return res.status(400).json({ message: "Title and description are required" });

    // Only a hash is prepared here. Blockchain submission is deliberately not claimed until a network/contract is configured.
    const complaintIdHash = "0x" + crypto.randomBytes(32).toString("hex");
    const contentHash = "0x" + hashText(JSON.stringify({
      title: String(title).trim(),
      description: String(description).trim(),
      incidentDate: incidentDate || null,
      incidentLocation: incidentLocation || "",
      category: category || ""
    }));

    const complaint = await Complaint.create({
      citizen: req.user._id, title, description, incidentDate: incidentDate || null,
      incidentLocation, category,
      blockchain: { complaintIdHash, contentHash, network: "not-connected" },
      statusHistory: [{ status: "Submitted", note: "Complaint submitted by citizen", changedBy: req.user._id }]
    });
    res.status(201).json({
      message: "Complaint submitted to RecordSafe. This is not an FIR registration.",
      complaint: {
        id: complaint._id, complaintNumber: complaint.complaintNumber || `RS-${String(complaint._id).slice(-8).toUpperCase()}`,
        title: complaint.title, status: complaint.status, createdAt: complaint.createdAt,
        blockchain: { complaintIdHash, contentHash, network: "not-connected" }
      }
    });
  } catch (error) { next(error); }
};

exports.listMine = async (req, res, next) => {
  try {
    const complaints = await Complaint.find({ citizen: req.user._id })
      .select("-description -evidence")
      .sort({ createdAt: -1 });
    res.json({ complaints });
  } catch (error) { next(error); }
};

exports.getOne = async (req, res, next) => {
  try {
    const filter = req.user.role === "citizen"
      ? { _id: req.params.id, citizen: req.user._id }
      : { _id: req.params.id };
    const complaint = await Complaint.findOne(filter)
      .populate("citizen", "name email")
      .populate("assignedInvestigator", "name email");
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });
    res.json({ complaint });
  } catch (error) { next(error); }
};

exports.listInbox = async (req, res, next) => {
  try {
    const complaints = await Complaint.find().select("-description -evidence").sort({ createdAt: -1 }).limit(200);
    res.json({ complaints });
  } catch (error) { next(error); }
};

// This route is for police review only. FIR registration is a separate, explicit action to be added with chain integration.
exports.updateStatus = async (req, res, next) => {
  try {
    const allowed = ["UnderReview", "InformationRequested", "Referred"];
    const { status, note } = req.body;
    if (!allowed.includes(status)) return res.status(400).json({ message: "Unsupported review status" });
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });
    complaint.status = status;
    complaint.statusHistory.push({ status, note: note || "", changedBy: req.user._id });
    await complaint.save();
    res.json({ message: "Complaint review status updated", complaint });
  } catch (error) { next(error); }
};
