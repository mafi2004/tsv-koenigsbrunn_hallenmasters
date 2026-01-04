// server/routes/minis5/index.js
const express = require('express');
const router = express.Router();

const teamsRouter    = require('./teams');
const matchesRouter  = require('./matches');
const scheduleRouter = require('./schedule');

// Basis: /api/minis5
router.use('/teams', teamsRouter);
router.use('/matches', matchesRouter);
router.use('/schedule', scheduleRouter);

module.exports = router;
