/**
 * Lightweight Event Bus
 * Decouples side-effects (commission, audit, notifications) from core logic.
 *
 * Events:
 *   SERVICE_REQUEST_CREATED  — new SR created
 *   SERVICE_REQUEST_COMPLETED — SR reached COMPLETED status
 *   SERVICE_REQUEST_ASSIGNED — counselor/agent assigned to SR
 *   TASK_SUBMITTED           — task submitted by student or rep3
 *   COMMISSION_CREATED       — new commission record created
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }
}

const eventBus = new EventBus();

// Event name constants
const EVENTS = {
  SERVICE_REQUEST_CREATED: 'service_request:created',
  SERVICE_REQUEST_COMPLETED: 'service_request:completed',
  SERVICE_REQUEST_ASSIGNED: 'service_request:assigned',
  SERVICE_REQUEST_STATUS_CHANGED: 'service_request:status_changed',
  TASK_SUBMITTED: 'task:submitted',
  COMMISSION_CREATED: 'commission:created'
};

module.exports = { eventBus, EVENTS };
