/**
 * Country Model
 * Comprehensive country information for study abroad destinations
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CountrySchema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Country code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Country name is required'],
      trim: true,
    },
    flagUrl: { type: String },
    heroImage: { type: String },

    // Quick Facts
    quickFacts: {
      population: { type: String },
      capital: { type: String },
      language: { type: String },
      currency: { type: String },
      academicYear: { type: String },
    },

    // Key Dates
    keyDates: {
      fallDeadline: { type: String },
      springDeadline: { type: String },
      summerDeadline: { type: String },
    },

    // Overview Sections
    overviewSections: [
      {
        title: { type: String },
        description: { type: String },
        points: [
          {
            heading: { type: String },
            text: { type: String },
          },
        ],
        cards: [
          {
            color: { type: String },
            title: { type: String },
            subtitle: { type: String },
            points: [{ type: String }],
          },
        ],
        note: {
          text: { type: String },
          color: { type: String },
          border: { type: String },
          textColor: { type: String },
        },
      },
    ],

    // Top Courses
    topcourse: [
      {
        title: { type: String },
        details: { type: String },
        color: { type: String },
      },
    ],

    // Top Universities
    topuniversities: [
      {
        name: { type: String },
        location: { type: String },
        rank: { type: String },
        notable: { type: String },
      },
    ],

    // Intakes
    intakes: [
      {
        label: { type: String },
        description: { type: String },
        icon: { type: String },
      },
    ],

    // Deadlines
    deadlines: [
      {
        title: { type: String },
        icon: { type: String },
        details: [{ type: String }],
      },
    ],

    // Admission Notes
    admissionnotes: [{ type: String }],

    // Requirements Data
    requirementsData: [
      {
        title: { type: String },
        color: { type: String },
        items: [{ type: String }],
      },
    ],

    CountrySpecificRequirements: { type: String },

    // Tuition Data
    tuitionData: [
      {
        level: { type: String },
        range: { type: String },
        average: { type: String },
        notes: { type: String },
      },
    ],

    tuitionNote: { type: String },

    // Expenses
    expenses: [
      {
        label: { type: String },
        range: { type: String },
        percentage: { type: Number },
      },
    ],

    // Regional Costs
    regionalCosts: [
      {
        region: { type: String },
        level: { type: String },
        color: { type: String },
        range: { type: String },
      },
    ],

    // Scholarships
    scholarships: [
      {
        category: { type: String },
        color: { type: String },
        items: [
          {
            title: { type: String },
            description: { type: String },
          },
        ],
      },
    ],

    // Financial Supports
    financialSupports: [
      {
        title: { type: String },
        description: { type: String },
      },
    ],

    TipsforScholarship: [{ type: String }],

    // Visa Data (Spain-specific naming kept for compatibility)
    spainVisaData: {
      title: { type: String },
      intro: { type: String },
      sections: [
        {
          title: { type: String },
          color: { type: String },
          items: [{ type: String }],
        },
      ],
      facts: [{ type: String }],
      benefits: [
        {
          title: { type: String },
          description: { type: String },
        },
      ],
    },

    // Visa Steps
    visaStepsData: [
      {
        step: { type: String },
        title: { type: String },
        color: { type: String },
        content: { type: String },
      },
    ],

    // Work Opportunities
    workOpportunitiesData: [
      {
        title: { type: String },
        color: { type: String },
        sections: [
          {
            heading: { type: String },
            points: [{ type: String }],
          },
        ],
      },
    ],

    // Job Market Data
    jobMarketData: {
      sectors: [{ type: String }],
      salaries: [{ type: String }],
    },

    // Best Cities
    bestCitiesData: [
      {
        city: { type: String },
        image: { type: String },
        universities: { type: String },
        description: { type: String },
        highlights: [{ type: String }],
      },
    ],

    // Student Life
    studentLifeData: {
      title: { type: String },
      icon: {
        bg: { type: String },
        color: { type: String },
      },
      sections: [
        {
          title: { type: String },
          bg: { type: String },
          border: { type: String },
          textColor: { type: String },
          items: [
            {
              title: { type: String },
              description: { type: String },
              badges: [{ type: String }],
            },
          ],
        },
      ],
      additionalInfo: {
        title: { type: String },
        description: { type: String },
        items: [
          {
            title: { type: String },
            points: [{ type: String }],
          },
        ],
      },
    },

    // Latest Updates
    latestUpdates2025: [
      {
        title: { type: String },
        description: { type: String },
        content: { type: String },
        category: { type: String },
        gradient: { type: String },
        border: { type: String },
        badgeColor: { type: String },
        titleColor: { type: String },
      },
    ],

    // Policy Changes
    policyChanges2025: [
      {
        title: { type: String },
        content: { type: String },
      },
    ],

    // Resource Cards
    resourcecards: [
      {
        title: { type: String },
        description: { type: String },
        buttonText: { type: String },
        gradient: { type: String },
        borderColor: { type: String },
        textColor: { type: String },
        buttonColor: { type: String },
      },
    ],

    // Official Links
    resourceofficialLinks: [
      {
        label: { type: String },
        href: { type: String },
      },
    ],

    // Guides
    resourceguides: [
      {
        label: { type: String },
        href: { type: String },
      },
    ],

    // Tools
    resourcetools: [
      {
        title: { type: String },
        description: { type: String },
        buttonText: { type: String },
      },
    ],

    // FAQs
    faqs: [
      {
        question: { type: String },
        answer: { type: String },
      },
    ],

    // Active status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (code already has unique index from schema)
CountrySchema.index({ name: 1 });
CountrySchema.index({ isActive: 1 });

module.exports = mongoose.model('Country', CountrySchema);
