import * as foodListingsService from '../services/foodListings.service.js';
import { validate } from '../utils/validate.js';
import { asyncHandler } from '../middleware/auth.js';

const CATEGORIES = ['BAKERY', 'PREPARED_MEALS', 'PRODUCE', 'DAIRY', 'MEAT', 'PACKAGED', 'OTHER'];

// GET /api/browse/listings
//
// Charities-only. The filters are the two a charity actually reasons with:
// what kind of food, and can I get there before the deadline passes.
export const browse = asyncHandler(async (req, res) => {
  const { category, pickupBefore, limit, offset } = validate(req.query)
    .allowOnly(['category', 'pickupBefore', 'limit', 'offset'])
    .oneOf('category', CATEGORIES, { required: false })
    .isoDate('pickupBefore', { required: false })
    .number('limit', { required: false, min: 1, max: 100 })
    .number('offset', { required: false, min: 0 })
    .result();

  // A filter for "collectable before X" is meaningless if X has already
  // gone; the service would simply return nothing, which reads as a bug.
  if (pickupBefore && new Date(pickupBefore).getTime() <= Date.now()) {
    res.status(400).json({
      error: 'Bad Request',
      code: 'DEADLINE_IN_PAST',
      message: 'pickupBefore must be in the future.',
      details: [{ field: 'pickupBefore', message: 'Must be a future timestamp.' }],
    });
    return;
  }

  res.json({
    listings: await foodListingsService.browseAvailable({
      category,
      pickupBefore,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }),
  });
});

// GET /api/browse/listings/:id
export const details = asyncHandler(async (req, res) => {
  res.json({
    listing: await foodListingsService.getListingDetails({ id: Number(req.params.id) }),
  });
});
