const express = require('express');
const { register } = require('../services/metrics');

const router = express.Router();

router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

module.exports = router; 