const router = require("express").Router();
const controller = require("../controllers/complaint.controller");
const { requireAuth, allowRoles } = require("../middleware/auth");

router.post("/", requireAuth, allowRoles("citizen"), controller.create);
router.get("/mine", requireAuth, allowRoles("citizen"), controller.listMine);
router.get("/inbox", requireAuth, allowRoles("police", "admin"), controller.listInbox);
router.get("/:id", requireAuth, controller.getOne);
router.patch("/:id/review-status", requireAuth, allowRoles("police"), controller.updateStatus);

module.exports = router;
