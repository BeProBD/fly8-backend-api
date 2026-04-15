/**
 * Event Listeners
 * Registers side-effect handlers for domain events.
 * All listeners are fire-and-forget — failures are logged, never propagated.
 */

const { eventBus, EVENTS } = require('./eventBus');
const { createAuditLog } = require('../utils/auditLogger');
const { createRepresentativeCommission, createVASCommission } = require('../services/commissionService');

/**
 * SERVICE_REQUEST_COMPLETED
 * Triggers: agent commission + representative commission + audit
 */
eventBus.on(EVENTS.SERVICE_REQUEST_COMPLETED, async ({ serviceRequest, triggeredBy, req }) => {
  try {
    // Agent/counselor commission
    if (serviceRequest.assignedAgent || serviceRequest.assignedCounselor) {
      await createVASCommission(serviceRequest, triggeredBy).catch(e =>
        console.error('VAS commission error:', e.message)
      );
    }

    // Representative commission (if SR has a representative)
    if (serviceRequest.representativeId) {
      await createRepresentativeCommission(serviceRequest, triggeredBy).catch(e =>
        console.error('Rep commission error:', e.message)
      );
    }
  } catch (err) {
    console.error('SERVICE_REQUEST_COMPLETED listener error:', err.message);
  }
});

/**
 * SERVICE_REQUEST_STATUS_CHANGED
 * Triggers: audit log for every status change
 */
eventBus.on(EVENTS.SERVICE_REQUEST_STATUS_CHANGED, async ({ serviceRequest, previousStatus, triggeredBy, req }) => {
  try {
    await createAuditLog({
      actorUserId: triggeredBy,
      actorRole: req?.user?.role || 'system',
      action: `service_request_status_${serviceRequest.status.toLowerCase()}`,
      entityType: 'service_request',
      entityId: serviceRequest.serviceRequestId,
      previousState: { status: previousStatus },
      newState: { status: serviceRequest.status },
      req
    });
  } catch (err) {
    console.error('STATUS_CHANGED audit error:', err.message);
  }
});

/**
 * TASK_SUBMITTED
 * Triggers: audit log
 */
eventBus.on(EVENTS.TASK_SUBMITTED, async ({ task, previousStatus, submittedBy, req }) => {
  try {
    await createAuditLog({
      actorUserId: submittedBy,
      actorRole: req?.user?.role || 'system',
      action: 'task_submitted',
      entityType: 'task',
      entityId: task.taskId,
      previousState: { status: previousStatus },
      newState: { status: task.status },
      details: { serviceRequestId: task.serviceRequestId },
      req
    });
  } catch (err) {
    console.error('TASK_SUBMITTED audit error:', err.message);
  }
});

/**
 * SERVICE_REQUEST_CREATED
 * Triggers: audit log
 */
eventBus.on(EVENTS.SERVICE_REQUEST_CREATED, async ({ serviceRequest, createdBy, req }) => {
  try {
    await createAuditLog({
      actorUserId: createdBy,
      actorRole: req?.user?.role || 'system',
      action: 'service_request_created',
      entityType: 'service_request',
      entityId: serviceRequest.serviceRequestId,
      newState: { status: serviceRequest.status, serviceType: serviceRequest.serviceType },
      details: { interactionMode: serviceRequest.interactionMode || null },
      req
    });
  } catch (err) {
    console.error('SERVICE_REQUEST_CREATED audit error:', err.message);
  }
});

module.exports = { registerListeners: () => {} }; // Listeners self-register on import
