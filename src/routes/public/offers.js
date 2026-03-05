/**
 * Public Offer Routes
 */

const express = require('express');
const router = express.Router();
const { getPublicOffers, getOfferCountries, getOfferById } = require('../../controllers/public/offerController');

router.get('/', getPublicOffers);
router.get('/countries', getOfferCountries);
router.get('/:id', getOfferById);

module.exports = router;
