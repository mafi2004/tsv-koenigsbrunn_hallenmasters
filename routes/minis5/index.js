// routes/minis5/index.js

const express = require('express');
const router = express.Router();

router.use('/teams', require('./teams'));
router.use('/matches', require('./matches'));

module.exports = router;
