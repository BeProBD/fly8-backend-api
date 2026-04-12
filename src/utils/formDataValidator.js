/**
 * Form Data Validator
 * Validates pre-application form data based on serviceType
 * before creating a service request.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;
const isBool = (v) => typeof v === 'boolean';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isOptionalString = (v) => v === undefined || v === null || v === '' || typeof v === 'string';
const isFutureOrTodayDate = (v) => {
  if (!isNonEmptyString(v)) return false;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
};

// ─── Valid sub-service keys for Pre-application Support ─────────────────────

const VALID_SUB_SERVICES = [
  'IELTS_REGISTRATION',
  'PTE_REGISTRATION',
  'IELTS_CLASS',
  'PTE_CLASS',
  'LANGUAGE_CLASS',
  'SOP',
  'LOR',
  'RESEARCH_APPLICATION',
  'FREE_RESOURCE',
  'COUNSELOR_APPOINTMENT',
];

// ─── Sub-service detail validators ─────────────────────────────────────────

const SUB_SERVICE_REQUIRED_FIELDS = {
  IELTS_REGISTRATION: ['preferredTestDate', 'preferredCenter'],
  PTE_REGISTRATION: ['preferredTestDate', 'preferredCenter'],
  IELTS_CLASS: ['mode', 'preferredSchedule'],
  PTE_CLASS: ['mode', 'preferredSchedule'],
  LANGUAGE_CLASS: ['language', 'currentLevel', 'mode'],
  SOP: ['targetUniversity', 'targetProgram', 'deadline'],
  LOR: ['targetUniversity', 'targetProgram', 'deadline'],
  RESEARCH_APPLICATION: ['fieldOfResearch'],
  FREE_RESOURCE: ['resourceType'],
  COUNSELOR_APPOINTMENT: ['preferredMeetingDate', 'mode'],
};

function validateSubServiceDetails(selectedSubServices, subServiceDetails) {
  const errors = [];

  if (!isObject(subServiceDetails)) {
    errors.push('subServiceDetails must be an object');
    return errors;
  }

  for (const key of selectedSubServices) {
    if (!VALID_SUB_SERVICES.includes(key)) {
      errors.push(`Invalid sub-service: ${key}`);
      continue;
    }

    const details = subServiceDetails[key];
    if (!details || !isObject(details)) {
      errors.push(`Details required for selected sub-service: ${key}`);
      continue;
    }

    const requiredFields = SUB_SERVICE_REQUIRED_FIELDS[key] || [];
    for (const field of requiredFields) {
      if (!details[field] || (typeof details[field] === 'string' && !details[field].trim())) {
        errors.push(`${key}: ${field} is required`);
      }
    }
  }

  return errors;
}

// ─── Validation schemas per service type ────────────────────────────────────

const VALIDATION_SCHEMAS = {
  // Pre-application Support
  UNIVERSITY_SHORTLISTING: {
    required: ['selectedSubServices'],
    validators: {
      selectedSubServices: (v) => {
        if (!isNonEmptyArray(v)) return 'At least one sub-service must be selected';
        const invalid = v.filter((s) => !VALID_SUB_SERVICES.includes(s));
        if (invalid.length) return `Invalid sub-services: ${invalid.join(', ')}`;
        return null;
      },
    },
    custom: (formData) => {
      return validateSubServiceDetails(
        formData.selectedSubServices || [],
        formData.subServiceDetails || {}
      );
    },
  },

  // Apply University
  APPLICATION_ASSISTANCE: {
    required: ['selectedPrograms'],
    validators: {
      selectedPrograms: (v) => {
        if (!isNonEmptyArray(v)) return 'At least one program must be selected';
        for (let i = 0; i < v.length; i++) {
          const p = v[i];
          if (!isObject(p)) return `Program at index ${i} must be an object`;
          if (!isNonEmptyString(p.programId)) return `Program at index ${i}: programId is required`;
          if (!isNonEmptyString(p.programName)) return `Program at index ${i}: programName is required`;
          if (!isNonEmptyString(p.universityName)) return `Program at index ${i}: universityName is required`;
        }
        return null;
      },
      applicationDetails: (v) => {
        if (v !== undefined && v !== null && !isObject(v)) return 'applicationDetails must be an object';
        return null;
      },
    },
  },

  // Visa & Interview Support
  VISA_GUIDANCE: {
    required: ['destinationCountry', 'visaType'],
    validators: {
      destinationCountry: (v) => (!isNonEmptyString(v) ? 'Destination country is required' : null),
      visaType: (v) => (!isNonEmptyString(v) ? 'Visa type is required' : null),
      passportExpiry: (v) => {
        if (!v) return null; // optional
        if (!isNonEmptyString(v)) return 'Passport expiry must be a valid date string';
        const d = new Date(v);
        if (isNaN(d.getTime())) return 'Passport expiry is not a valid date';
        // Must have at least 6 months validity
        const sixMonths = new Date();
        sixMonths.setMonth(sixMonths.getMonth() + 6);
        if (d < sixMonths) return 'Passport must have at least 6 months validity';
        return null;
      },
    },
  },

  // Ticket & Travel Support
  SCHOLARSHIP_SEARCH: {
    required: ['destinationCountry', 'destinationCity', 'departureCity'],
    validators: {
      destinationCountry: (v) => (!isNonEmptyString(v) ? 'Destination country is required' : null),
      destinationCity: (v) => (!isNonEmptyString(v) ? 'Destination city is required' : null),
      departureCity: (v) => (!isNonEmptyString(v) ? 'Departure city is required' : null),
      preferredDepartureDate: (v) => {
        if (!v) return null;
        if (!isNonEmptyString(v)) return 'Departure date must be a valid date';
        const d = new Date(v);
        if (isNaN(d.getTime())) return 'Departure date is not a valid date';
        return null;
      },
    },
  },

  // Find Accommodation
  ACCOMMODATION_HELP: {
    required: ['destinationCity', 'accommodationType', 'monthlyBudget'],
    validators: {
      destinationCity: (v) => (!isNonEmptyString(v) ? 'Destination city is required' : null),
      accommodationType: (v) => (!isNonEmptyString(v) ? 'Accommodation type is required' : null),
      monthlyBudget: (v) => (!isNonEmptyString(v) ? 'Monthly budget is required' : null),
      moveInDate: (v) => {
        if (!v) return null;
        const d = new Date(v);
        if (isNaN(d.getTime())) return 'Move-in date is not a valid date';
        return null;
      },
    },
  },

  // Education Loan
  LOAN_ASSISTANCE: {
    required: ['universityName', 'loanAmountNeeded', 'hasCoApplicant'],
    validators: {
      universityName: (v) => (!isNonEmptyString(v) ? 'University name is required' : null),
      loanAmountNeeded: (v) => (!isNonEmptyString(v) ? 'Loan amount is required' : null),
      hasCoApplicant: (v) => (!isBool(v) ? 'Co-applicant status is required' : null),
      coApplicant: (v, formData) => {
        if (formData.hasCoApplicant === true) {
          if (!isObject(v)) return 'Co-applicant details are required';
          if (!isNonEmptyString(v.relationship)) return 'Co-applicant relationship is required';
          if (!isNonEmptyString(v.occupation)) return 'Co-applicant occupation is required';
        }
        return null;
      },
    },
  },

  // Find Jobs Abroad
  PRE_DEPARTURE_ORIENTATION: {
    required: ['destinationCountry', 'jobType', 'fieldOfInterest'],
    validators: {
      destinationCountry: (v) => (!isNonEmptyString(v) ? 'Destination country is required' : null),
      jobType: (v) => (!isNonEmptyString(v) ? 'Job type is required' : null),
      fieldOfInterest: (v) => (!isNonEmptyString(v) ? 'Field of interest is required' : null),
    },
  },
};

// ─── Main validation function ───────────────────────────────────────────────

/**
 * Validate formData based on serviceType.
 * @param {string} serviceType - The service type enum value
 * @param {object} formData - The form data submitted by the student
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateFormData(serviceType, formData) {
  // Profile Assessment uses Student model — skip validation
  if (serviceType === 'PROFILE_ASSESSMENT') {
    return { valid: true };
  }

  const schema = VALIDATION_SCHEMAS[serviceType];

  // No schema defined for this type — allow without validation
  if (!schema) {
    return { valid: true };
  }

  // formData is required for types that have schemas
  if (!formData || !isObject(formData)) {
    return { valid: false, errors: ['Form data is required for this service type'] };
  }

  const errors = [];

  // 1. Check required fields exist
  for (const field of schema.required) {
    const value = formData[field];
    if (value === undefined || value === null || value === '') {
      errors.push(`${field} is required`);
    }
  }

  // 2. Run field-level validators
  if (schema.validators) {
    for (const [field, validator] of Object.entries(schema.validators)) {
      const value = formData[field];
      const error = validator(value, formData);
      if (error) {
        errors.push(error);
      }
    }
  }

  // 3. Run custom cross-field validation
  if (schema.custom) {
    const customErrors = schema.custom(formData);
    if (customErrors && customErrors.length > 0) {
      errors.push(...customErrors);
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

module.exports = { validateFormData };
