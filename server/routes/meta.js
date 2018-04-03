const express = require('express');
const metadata = require('../../webtask.json');

module.exports = () => {
  const api = express.Router(); // eslint-disable-line new-cap
  api.get('/', (req, res) => {
    res.status(200).send(metadata);
  });

  return api;
};
