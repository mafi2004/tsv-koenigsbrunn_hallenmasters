// routes/minis5/index.js

const express = require('express');
const router = express.Router();

router.use('/teams', require('./teams'));
router.use('/', require('./matches'));

module.exports = router;
