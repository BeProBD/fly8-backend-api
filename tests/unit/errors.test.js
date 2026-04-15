/**
 * Error Classes Unit Tests
 */

const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  asyncHandler
} = require('../../src/utils/errors');

describe('Custom Error Classes', () => {
  test('ForbiddenError has correct properties', () => {
    const err = new ForbiddenError('No access');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('No access');
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  test('NotFoundError has correct defaults', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Resource not found');
    expect(err.code).toBe('NOT_FOUND');
  });

  test('BadRequestError has correct status', () => {
    const err = new BadRequestError('Missing field');
    expect(err.statusCode).toBe(400);
  });

  test('UnauthorizedError has correct status', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  test('ConflictError has correct status', () => {
    const err = new ConflictError('Already exists');
    expect(err.statusCode).toBe(409);
  });

  test('ValidationError has correct status', () => {
    const err = new ValidationError('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('Custom code override works', () => {
    const err = new ForbiddenError('Blocked', 'INTERACTION_MODE_BLOCKED');
    expect(err.code).toBe('INTERACTION_MODE_BLOCKED');
  });
});

describe('asyncHandler', () => {
  test('passes resolved value through', async () => {
    const handler = asyncHandler(async (req, res) => {
      res.json({ ok: true });
    });

    const res = { json: jest.fn() };
    const next = jest.fn();

    await handler({}, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  test('catches and forwards errors to next()', async () => {
    const error = new Error('boom');
    const handler = asyncHandler(async () => {
      throw error;
    });

    const next = jest.fn();
    await handler({}, {}, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
