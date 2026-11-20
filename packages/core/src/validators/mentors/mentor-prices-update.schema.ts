import { z } from 'zod';

// `PUT /api/mentors/me/prices` and the /mentor/prices form (spec 2026-10-21-mentor-prices). Shape
// only: a major-unit decimal string kept as a string, so the server parses it exactly into cents
// (`parseMajorAmount`); the bounds are the service's job. No signs, exponents, separators,
// whitespace or more than two fractional digits.

export const MAJOR_AMOUNT = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
export const AMOUNT_MESSAGE = 'Enter an amount like 150 or 150.50.';

const amount = z.string().regex(MAJOR_AMOUNT, AMOUNT_MESSAGE);

export const mentorPricesUpdateSchema = z.object({
  price25: amount,
  price50: amount,
});

export type MentorPricesUpdateInput = z.output<typeof mentorPricesUpdateSchema>;
