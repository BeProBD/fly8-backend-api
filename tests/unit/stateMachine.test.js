/**
 * State Machine Unit Tests
 * Tests all valid/invalid transitions and role-based permissions.
 */

const { validateStateTransition, VALID_TRANSITIONS, ROLE_PERMISSIONS } = require('../../src/utils/stateMachine');

describe('validateStateTransition', () => {
  // ── Valid transitions ──────────────────────────────────────────────

  test('super_admin can assign a pending request', () => {
    const result = validateStateTransition('super_admin', 'PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED');
    expect(result.valid).toBe(true);
  });

  test('counselor can move ASSIGNED → IN_PROGRESS', () => {
    const result = validateStateTransition('counselor', 'ASSIGNED', 'IN_PROGRESS');
    expect(result.valid).toBe(true);
  });

  test('agent can move IN_PROGRESS → COMPLETED', () => {
    const result = validateStateTransition('agent', 'IN_PROGRESS', 'COMPLETED');
    expect(result.valid).toBe(true);
  });

  test('counselor can move IN_PROGRESS → WAITING_STUDENT', () => {
    const result = validateStateTransition('counselor', 'IN_PROGRESS', 'WAITING_STUDENT');
    expect(result.valid).toBe(true);
  });

  test('student can cancel from ASSIGNED', () => {
    const result = validateStateTransition('student', 'ASSIGNED', 'CANCELLED');
    expect(result.valid).toBe(true);
  });

  test('rep3 can cancel from ASSIGNED', () => {
    const result = validateStateTransition('rep3', 'ASSIGNED', 'CANCELLED');
    expect(result.valid).toBe(true);
  });

  // ── Invalid transitions ────────────────────────────────────────────

  test('cannot transition from COMPLETED (terminal)', () => {
    const result = validateStateTransition('super_admin', 'COMPLETED', 'IN_PROGRESS');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('terminal state');
  });

  test('cannot transition from CANCELLED (terminal)', () => {
    const result = validateStateTransition('super_admin', 'CANCELLED', 'IN_PROGRESS');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('terminal state');
  });

  test('cannot skip from PENDING to COMPLETED directly', () => {
    const result = validateStateTransition('super_admin', 'PENDING_ADMIN_ASSIGNMENT', 'COMPLETED');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition');
  });

  test('cannot move backwards from IN_PROGRESS to ASSIGNED', () => {
    const result = validateStateTransition('counselor', 'IN_PROGRESS', 'ASSIGNED');
    expect(result.valid).toBe(false);
  });

  // ── Role-based restrictions ────────────────────────────────────────

  test('student cannot set status to ASSIGNED', () => {
    const result = validateStateTransition('student', 'PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED');
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Role 'student'");
  });

  test('student cannot complete a request', () => {
    const result = validateStateTransition('student', 'IN_PROGRESS', 'COMPLETED');
    expect(result.valid).toBe(false);
  });

  test('rep3 cannot complete a request', () => {
    const result = validateStateTransition('rep3', 'IN_PROGRESS', 'COMPLETED');
    expect(result.valid).toBe(false);
  });

  test('unknown role gets empty permissions', () => {
    const result = validateStateTransition('rep1', 'ASSIGNED', 'IN_PROGRESS');
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Role 'rep1'");
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  test('unknown current status returns error', () => {
    const result = validateStateTransition('super_admin', 'INVALID_STATUS', 'ASSIGNED');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown current status');
  });

  test('returns allowed transitions on failure', () => {
    const result = validateStateTransition('counselor', 'ASSIGNED', 'COMPLETED');
    expect(result.valid).toBe(false);
    expect(result.allowedTransitions).toBeDefined();
    expect(Array.isArray(result.allowedTransitions)).toBe(true);
  });
});

describe('VALID_TRANSITIONS map', () => {
  test('covers all known statuses', () => {
    const expected = [
      'PENDING_ADMIN_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS',
      'WAITING_STUDENT', 'ON_HOLD', 'COMPLETED', 'CANCELLED'
    ];
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(expected.sort());
  });

  test('terminal states have empty arrays', () => {
    expect(VALID_TRANSITIONS.COMPLETED).toEqual([]);
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe('ROLE_PERMISSIONS map', () => {
  test('super_admin has the most permissions', () => {
    expect(ROLE_PERMISSIONS.super_admin.length).toBeGreaterThanOrEqual(
      ROLE_PERMISSIONS.counselor.length
    );
  });

  test('student can only cancel', () => {
    expect(ROLE_PERMISSIONS.student).toEqual(['CANCELLED']);
  });

  test('rep3 can only cancel', () => {
    expect(ROLE_PERMISSIONS.rep3).toEqual(['CANCELLED']);
  });
});
