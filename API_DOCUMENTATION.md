# Fly8 API Documentation

## Base URL
```
Development: http://localhost:8001/api
Production: https://api.fly8.global/api
```

## Authentication

All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

---

## Authentication Endpoints

### POST /auth/signup
Register a new user.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "role": "student" // or "counselor", "agent", "super_admin"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "uuid-string",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "student"
  }
}
```

**Errors:**
- 400: Email already registered
- 500: Signup failed

---

### POST /auth/login
Authenticate user and get token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "uuid-string",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "student"
  }
}
```

**Errors:**
- 401: Invalid credentials
- 500: Login failed

---

### GET /auth/me
Get current authenticated user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "userId": "uuid-string",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "student",
    "phone": "+1234567890",
    "country": "United States"
  }
}
```

---

## Student Endpoints

### POST /students/onboarding
Complete student onboarding process.

**Auth Required:** Student role

**Request Body:**
```json
{
  "interestedCountries": ["United States", "Canada", "UK"],
  "selectedServices": ["service-1", "service-2", "service-3"],
  "phone": "+1234567890",
  "country": "India"
}
```

**Response (201):**
```json
{
  "message": "Onboarding completed",
  "student": {
    "studentId": "uuid-string",
    "userId": "uuid-string",
    "interestedCountries": ["United States", "Canada", "UK"],
    "selectedServices": ["service-1", "service-2", "service-3"],
    "onboardingCompleted": true
  }
}
```

---

### GET /students/profile
Get student profile.

**Auth Required:** Student role

**Response (200):**
```json
{
  "student": {
    "studentId": "uuid-string",
    "userId": "uuid-string",
    "interestedCountries": ["United States", "Canada"],
    "selectedServices": ["service-1", "service-2"],
    "assignedCounselor": "counselor-user-id",
    "assignedAgent": "agent-user-id",
    "commissionPercentage": 10,
    "status": "active"
  }
}
```

---

### POST /students/apply-services
Apply for multiple services.

**Auth Required:** Student role

**Request Body:**
```json
{
  "serviceIds": ["service-1", "service-2", "service-3"]
}
```

**Response (201):**
```json
{
  "message": "Services applied successfully",
  "applications": [
    {
      "applicationId": "uuid-string",
      "studentId": "uuid-string",
      "serviceId": "service-1",
      "status": "not_started",
      "appliedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### GET /students/my-applications
Get all student's service applications.

**Auth Required:** Student role

**Response (200):**
```json
{
  "applications": [
    {
      "applicationId": "uuid-string",
      "studentId": "uuid-string",
      "serviceId": "service-1",
      "status": "in_progress",
      "assignedCounselor": "uuid-string",
      "assignedAgent": "uuid-string",
      "notes": [
        {
          "text": "Started profile assessment",
          "addedBy": "counselor-id",
          "addedAt": "2025-01-01T00:00:00.000Z"
        }
      ],
      "documents": [],
      "appliedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## Service Endpoints

### GET /services
Get all active services.

**Response (200):**
```json
{
  "services": [
    {
      "serviceId": "service-1",
      "name": "Profile Assessment",
      "description": "Complete profile evaluation and career counseling",
      "icon": "UserCircle",
      "color": "#3B82F6",
      "order": 1,
      "isActive": true
    }
  ]
}
```

---

### POST /services/init
Initialize the 8 predefined services (setup only).

**Response (200):**
```json
{
  "message": "Services initialized",
  "count": 8
}
```

---

## Admin Endpoints

### GET /admin/metrics
Get dashboard metrics.

**Auth Required:** Super Admin role

**Response (200):**
```json
{
  "metrics": {
    "totalStudents": 150,
    "totalCounselors": 10,
    "totalAgents": 25,
    "activeApplications": 85,
    "completedApplications": 42
  }
}
```

---

### GET /admin/students
Get all students with details.

**Auth Required:** Super Admin role

**Response (200):**
```json
{
  "students": [
    {
      "studentId": "uuid-string",
      "userId": "uuid-string",
      "user": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@student.com"
      },
      "assignedCounselor": "uuid-string",
      "assignedAgent": "uuid-string",
      "applications": []
    }
  ]
}
```

---

### PUT /admin/students/:studentId/assign-counselor
Assign counselor to student.

**Auth Required:** Super Admin role

**Request Body:**
```json
{
  "counselorId": "uuid-string"
}
```

**Response (200):**
```json
{
  "message": "Counselor assigned",
  "student": {
    "studentId": "uuid-string",
    "assignedCounselor": "uuid-string"
  }
}
```

---

### PUT /admin/students/:studentId/assign-agent
Assign agent to student with commission.

**Auth Required:** Super Admin role

**Request Body:**
```json
{
  "agentId": "uuid-string",
  "commissionPercentage": 15
}
```

**Response (200):**
```json
{
  "message": "Agent assigned",
  "student": {
    "studentId": "uuid-string",
    "assignedAgent": "uuid-string",
    "commissionPercentage": 15
  }
}
```

---

### GET /admin/commissions
Get all commissions with summary.

**Auth Required:** Super Admin role

**Response (200):**
```json
{
  "commissions": [
    {
      "commissionId": "uuid-string",
      "agentId": "uuid-string",
      "studentId": "uuid-string",
      "serviceId": "service-1",
      "amount": 150.00,
      "percentage": 15,
      "status": "pending",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "summary": {
    "total": 25,
    "pending": 10,
    "approved": 8,
    "paid": 7,
    "totalPending": 1500.00,
    "totalPaid": 1050.00
  }
}
```

---

### PUT /admin/commissions/:commissionId/approve
Approve a pending commission.

**Auth Required:** Super Admin role

**Response (200):**
```json
{
  "message": "Commission approved",
  "commission": {
    "commissionId": "uuid-string",
    "status": "approved"
  }
}
```

---

### POST /admin/commissions/:commissionId/payout
Process commission payout.

**Auth Required:** Super Admin role

**Response (200):**
```json
{
  "message": "Commission payout processed",
  "commission": {
    "commissionId": "uuid-string",
    "status": "paid",
    "paidAt": "2025-01-01T00:00:00.000Z"
  }
}
```

---

## Counselor Endpoints

### GET /counselors/my-students
Get assigned students.

**Auth Required:** Counselor role

**Response (200):**
```json
{
  "students": [
    {
      "studentId": "uuid-string",
      "user": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@student.com"
      },
      "applications": []
    }
  ]
}
```

---

### PUT /counselors/applications/:applicationId
Update application status and add notes.

**Auth Required:** Counselor role

**Request Body:**
```json
{
  "status": "in_progress",
  "notes": "Started working on profile assessment"
}
```

**Response (200):**
```json
{
  "message": "Application updated",
  "application": {
    "applicationId": "uuid-string",
    "status": "in_progress",
    "notes": [
      {
        "text": "Started working on profile assessment",
        "addedBy": "counselor-id",
        "addedAt": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

## Agent Endpoints

### GET /agents/my-students
Get assigned students.

**Auth Required:** Agent role

**Response (200):**
```json
{
  "students": [
    {
      "studentId": "uuid-string",
      "user": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "applications": [],
      "commissionPercentage": 15
    }
  ]
}
```

---

### GET /agents/commissions
Get commission data and summary.

**Auth Required:** Agent role

**Response (200):**
```json
{
  "commissions": [
    {
      "commissionId": "uuid-string",
      "amount": 150.00,
      "percentage": 15,
      "status": "approved",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "summary": {
    "totalPending": 300.00,
    "totalApproved": 450.00,
    "totalPaid": 600.00,
    "lifetimeEarnings": 600.00,
    "totalCommissions": 15
  }
}
```

---

### POST /agents/commissions/:commissionId/request-payout
Request payout for approved commission.

**Auth Required:** Agent role

**Response (200):**
```json
{
  "message": "Payout processed",
  "commission": {
    "commissionId": "uuid-string",
    "status": "paid",
    "paidAt": "2025-01-01T00:00:00.000Z"
  }
}
```

---

## Payment Endpoints

### POST /payments/create
Create a payment for a service.

**Auth Required:** Student role

**Request Body:**
```json
{
  "serviceId": "service-1",
  "amount": 1000.00
}
```

**Response (201):**
```json
{
  "message": "Payment created",
  "payment": {
    "paymentId": "uuid-string",
    "studentId": "uuid-string",
    "serviceId": "service-1",
    "amount": 1000.00,
    "status": "pending"
  }
}
```

---

### GET /payments/my-payments
Get student's payment history.

**Auth Required:** Student role

**Response (200):**
```json
{
  "payments": [
    {
      "paymentId": "uuid-string",
      "serviceId": "service-1",
      "amount": 1000.00,
      "status": "completed",
      "paidAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /payments/:paymentId/complete
Mark payment as completed (testing endpoint).

**Auth Required:** Any authenticated user

**Response (200):**
```json
{
  "message": "Payment completed",
  "payment": {
    "paymentId": "uuid-string",
    "status": "completed",
    "paidAt": "2025-01-01T00:00:00.000Z"
  }
}
```

---

## Notification Endpoints

### GET /notifications
Get user notifications.

**Auth Required:** Any role

**Response (200):**
```json
{
  "notifications": [
    {
      "notificationId": "uuid-string",
      "type": "service_application",
      "title": "New Service Application",
      "message": "John Doe applied for service",
      "isRead": false,
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "unreadCount": 5
}
```

---

### PUT /notifications/:notificationId/read
Mark notification as read.

**Auth Required:** Any role

**Response (200):**
```json
{
  "message": "Notification marked as read"
}
```

---

### PUT /notifications/mark-all-read
Mark all notifications as read.

**Auth Required:** Any role

**Response (200):**
```json
{
  "message": "All notifications marked as read"
}
```

---

## Audit Log Endpoints

### GET /audit
Get audit logs with filters.

**Auth Required:** Super Admin role

**Query Parameters:**
- `userId` - Filter by user ID
- `action` - Filter by action type
- `startDate` - Filter from date
- `endDate` - Filter to date
- `limit` - Number of records (default: 100)

**Response (200):**
```json
{
  "logs": [
    {
      "logId": "uuid-string",
      "userId": "uuid-string",
      "action": "payment_completed",
      "resourceType": "payment",
      "resourceId": "payment-id",
      "details": {
        "amount": 1000.00
      },
      "ipAddress": "192.168.1.1",
      "timestamp": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 50
}
```

---

### GET /audit/user/:userId
Get user's activity log.

**Auth Required:** Super Admin or own user

**Response (200):**
```json
{
  "logs": [
    {
      "logId": "uuid-string",
      "action": "user_login",
      "timestamp": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### GET /audit/stats
Get audit statistics.

**Auth Required:** Super Admin role

**Response (200):**
```json
{
  "totalLogs": 1250,
  "actionCounts": [
    { "_id": "user_login", "count": 450 },
    { "_id": "service_applied", "count": 200 }
  ],
  "recentActivity": []
}
```

---

## WebSocket Events (Socket.io)

### Connection
```javascript
const socket = io('https://api.fly8.global', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

**Client listens:**
- `connect` - Connected to server
- `disconnect` - Disconnected from server
- `new_notification` - New notification received
- `service_application` - New service application
- `commission_paid` - Commission payment received

**Example:**
```javascript
socket.on('new_notification', (notification) => {
  console.log('New notification:', notification);
  // Update UI
});

socket.on('commission_paid', (commission) => {
  console.log('Commission paid:', commission);
  // Show success message
});
```

---

## Error Responses

All endpoints may return these standard errors:

**400 Bad Request:**
```json
{
  "error": "Invalid input data"
}
```

**401 Unauthorized:**
```json
{
  "error": "No token provided"
}
```

**403 Forbidden:**
```json
{
  "error": "Access denied"
}
```

**404 Not Found:**
```json
{
  "error": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

- **Default:** 100 requests per 15 minutes per IP
- **Auth endpoints:** 5 requests per 15 minutes per IP

Exceeded rate limit returns:
```json
{
  "error": "Too many requests",
  "retryAfter": 900
}
```

---

## Pagination

Endpoints with pagination support:
- `limit` - Number of items per page (default: 50, max: 100)
- `page` - Page number (default: 1)
- `sort` - Sort field (default: createdAt)
- `order` - Sort order (asc/desc, default: desc)

**Example:**
```
GET /api/admin/students?limit=20&page=2&sort=createdAt&order=desc
```

**Response includes:**
```json
{
  "data": [],
  "pagination": {
    "currentPage": 2,
    "totalPages": 10,
    "totalItems": 200,
    "itemsPerPage": 20
  }
}
```

---

## Testing

### Postman Collection

Import our Postman collection for easy API testing:
[Download Collection](https://api.fly8.global/postman/collection.json)

### Example cURL Commands

**Login:**
```bash
curl -X POST https://api.fly8.global/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@student.com","password":"password123"}'
```

**Get Profile (with token):**
```bash
curl -X GET https://api.fly8.global/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Support

For API support:
- Email: api-support@fly8.global
- Slack: #api-support
- Documentation: https://docs.fly8.global/api

---

**Last Updated:** January 2025
**API Version:** 1.0.0
