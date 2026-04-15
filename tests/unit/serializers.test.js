/**
 * Serializer Unit Tests
 * Verifies field-level RBAC for all roles.
 */

const {
  serializeStudent,
  serializeServiceRequest,
  serializeTask,
  serializeUser
} = require('../../src/utils/serializers');

// ── Mock data ────────────────────────────────────────────────────────
const mockStudent = {
  studentId: 'stu-1',
  userId: 'usr-1',
  status: 'active',
  country: 'Germany',
  interestedCountries: ['Germany', 'Austria'],
  selectedServices: ['PROFILE_ASSESSMENT'],
  onboardingCompleted: true,
  interactionMode: 'student-counselor',
  assignedCounselor: 'coun-1',
  assignedAgent: 'agent-1',
  referredBy: 'rep-1',
  createdByRep: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  // Sensitive fields
  gpa: '3.8',
  ielts: '7.5',
  toefl: '100',
  gre: '320',
  budget: '$50000',
  commissionPercentage: 20,
  careerGoals: 'Become a researcher',
  industry: 'tech',
  workLocation: 'study-country',
  documents: { transcripts: 'https://cdn.example.com/transcript.pdf' },
  referralNotes: 'Internal note about referral',
  user: {
    userId: 'usr-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    avatar: 'https://cdn.example.com/avatar.png',
    phone: '+1234567890'
  }
};

const mockServiceRequest = {
  serviceRequestId: 'sr-1',
  studentId: 'stu-1',
  serviceType: 'PROFILE_ASSESSMENT',
  status: 'IN_PROGRESS',
  assignedCounselor: 'coun-1',
  interactionMode: 'student-counselor',
  createdAt: new Date(),
  // Sensitive fields
  notes: [{ text: 'Internal note' }],
  internalNotes: 'Admin-only note',
  adminNotes: 'Super admin note',
  formData: { field1: 'value' },
  metadata: { source: 'api' },
  agentApprovalStatus: 'APPROVED',
  isAgentInitiated: true,
  approvedBy: 'admin-1',
  approvalNotes: 'Approved because...'
};

const mockTask = {
  taskId: 'task-1',
  title: 'Upload Transcript',
  status: 'PENDING',
  dueDate: new Date(),
  createdAt: new Date(),
  // Detail fields
  description: 'Please upload your transcript',
  attachments: [{ url: 'https://cdn.example.com/file.pdf' }],
  submissionText: 'Here is my transcript',
  submissionFiles: []
};

// ── Student serializer tests ─────────────────────────────────────────

describe('serializeStudent', () => {
  test('rep1 sees only base fields + user', () => {
    const result = serializeStudent(mockStudent, 'rep1');

    expect(result.studentId).toBe('stu-1');
    expect(result.status).toBe('active');
    expect(result.user).toBeDefined();

    // Must NOT see sensitive fields
    expect(result.gpa).toBeUndefined();
    expect(result.ielts).toBeUndefined();
    expect(result.budget).toBeUndefined();
    expect(result.documents).toBeUndefined();
    expect(result.commissionPercentage).toBeUndefined();
    expect(result.careerGoals).toBeUndefined();
    expect(result.referralNotes).toBeUndefined();
  });

  test('rep2 has same restrictions as rep1', () => {
    const r1 = serializeStudent(mockStudent, 'rep1');
    const r2 = serializeStudent(mockStudent, 'rep2');
    expect(Object.keys(r1).sort()).toEqual(Object.keys(r2).sort());
  });

  test('rep3 sees academics but not internal fields', () => {
    const result = serializeStudent(mockStudent, 'rep3');

    expect(result.gpa).toBe('3.8');
    expect(result.ielts).toBe('7.5');
    expect(result.budget).toBe('$50000');

    // Must NOT see internal fields
    expect(result.commissionPercentage).toBeUndefined();
    expect(result.referralNotes).toBeUndefined();
  });

  test('super_admin sees everything', () => {
    const result = serializeStudent(mockStudent, 'super_admin');
    expect(result.gpa).toBe('3.8');
    expect(result.commissionPercentage).toBe(20);
    expect(result.documents).toBeDefined();
  });

  test('handles null input', () => {
    expect(serializeStudent(null, 'rep1')).toBeNull();
  });
});

// ── Service request serializer tests ─────────────────────────────────

describe('serializeServiceRequest', () => {
  test('rep1 sees only base fields', () => {
    const result = serializeServiceRequest(mockServiceRequest, 'rep1');

    expect(result.serviceRequestId).toBe('sr-1');
    expect(result.status).toBe('IN_PROGRESS');

    // Must NOT see sensitive fields
    expect(result.notes).toBeUndefined();
    expect(result.internalNotes).toBeUndefined();
    expect(result.formData).toBeUndefined();
    expect(result.metadata).toBeUndefined();
    expect(result.agentApprovalStatus).toBeUndefined();
  });

  test('student sees no internal notes or agent approval', () => {
    const result = serializeServiceRequest(mockServiceRequest, 'student');

    expect(result.serviceRequestId).toBe('sr-1');
    expect(result.internalNotes).toBeUndefined();
    expect(result.adminNotes).toBeUndefined();
    expect(result.agentApprovalStatus).toBeUndefined();
    expect(result.isAgentInitiated).toBeUndefined();
  });

  test('counselor sees everything except admin notes', () => {
    const result = serializeServiceRequest(mockServiceRequest, 'counselor');

    expect(result.notes).toBeDefined();
    expect(result.internalNotes).toBeDefined();
    expect(result.adminNotes).toBeUndefined();
  });

  test('super_admin sees everything', () => {
    const result = serializeServiceRequest(mockServiceRequest, 'super_admin');
    expect(result.adminNotes).toBeDefined();
    expect(result.formData).toBeDefined();
  });
});

// ── Task serializer tests ────────────────────────────────────────────

describe('serializeTask', () => {
  test('rep1 sees only summary fields', () => {
    const result = serializeTask(mockTask, 'rep1');

    expect(result.taskId).toBe('task-1');
    expect(result.title).toBe('Upload Transcript');
    expect(result.status).toBe('PENDING');

    // Must NOT see detail fields
    expect(result.description).toBeUndefined();
    expect(result.attachments).toBeUndefined();
    expect(result.submissionText).toBeUndefined();
  });

  test('counselor sees full task', () => {
    const result = serializeTask(mockTask, 'counselor');
    expect(result.description).toBe('Please upload your transcript');
    expect(result.attachments).toBeDefined();
  });
});

// ── User serializer tests ────────────────────────────────────────────

describe('serializeUser', () => {
  const mockUser = {
    userId: 'usr-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    avatar: 'https://cdn.example.com/avatar.png',
    password: 'hashed_password',
    phone: '+1234567890',
    role: 'student'
  };

  test('never exposes password for any role', () => {
    ['rep1', 'rep2', 'rep3', 'counselor', 'agent', 'super_admin'].forEach(role => {
      const result = serializeUser(mockUser, role);
      expect(result.password).toBeUndefined();
    });
  });

  test('rep1/rep2 sees limited user fields', () => {
    const result = serializeUser(mockUser, 'rep1');
    expect(result.userId).toBe('usr-1');
    expect(result.firstName).toBe('John');
    expect(result.email).toBe('john@example.com');
    expect(result.phone).toBeUndefined();
    expect(result.role).toBeUndefined();
  });
});
