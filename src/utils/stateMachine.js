/**
 * Service Request State Machine
 * Centralizes all status transition rules and role-based permissions.
 */

const VALID_TRANSITIONS = {
  'PENDING_ADMIN_ASSIGNMENT': ['ASSIGNED', 'CANCELLED'],
  'ASSIGNED':                 ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  'IN_PROGRESS':              ['WAITING_STUDENT', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
  'WAITING_STUDENT':          ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  'ON_HOLD':                  ['IN_PROGRESS', 'CANCELLED'],
  'COMPLETED':                [], // terminal
  'CANCELLED':                []  // terminal
};

/**
 * Which roles can trigger which transitions.
 * - super_admin can do everything
 * - counselor/agent can move assigned cases through workflow
 * - student/rep3 can only cancel their own requests (if not yet in-progress)
 */
const ROLE_PERMISSIONS = {
  super_admin: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_STUDENT', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  counselor:   ['IN_PROGRESS', 'WAITING_STUDENT', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  agent:       ['IN_PROGRESS', 'WAITING_STUDENT', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  student:     ['CANCELLED'],
  rep3:        ['CANCELLED']
};

/**
 * Validate a status transition.
 * @param {String} role - The user's role
 * @param {String} currentStatus - Current status of the service request
 * @param {String} nextStatus - Requested next status
 * @returns {{ valid: boolean, error?: string, allowedTransitions?: string[] }}
 */
function validateStateTransition(role, currentStatus, nextStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { valid: false, error: `Unknown current status: ${currentStatus}` };
  }

  if (allowed.length === 0) {
    return {
      valid: false,
      error: `${currentStatus} is a terminal state — no further transitions allowed`,
      allowedTransitions: []
    };
  }

  if (!allowed.includes(nextStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${nextStatus}`,
      allowedTransitions: allowed
    };
  }

  const roleAllowed = ROLE_PERMISSIONS[role] || [];
  if (!roleAllowed.includes(nextStatus)) {
    return {
      valid: false,
      error: `Role '${role}' cannot set status to ${nextStatus}`,
      allowedTransitions: allowed.filter(s => roleAllowed.includes(s))
    };
  }

  return { valid: true };
}

module.exports = {
  VALID_TRANSITIONS,
  ROLE_PERMISSIONS,
  validateStateTransition
};
