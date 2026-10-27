const router = require("express").Router();
const controller = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");

router.post("/register", controller.register);
router.post("/login", controller.login);
router.get("/me", requireAuth, controller.me);

module.exports = router;
