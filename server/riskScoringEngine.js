// server/riskScoringEngine.js

class RiskScoringEngine {
  /**
   * Deterministic weighted risk scoring engine.
   * Returns a risk score between 0 and 100, risk level, and explainable factor list.
   */
  static calculateClaimRisk({
    apaarVerified,
    admissionEvidenceFound,
    joiningEvidenceFound,
    duplicateDetected,
    studentDisputed,
    seatCategoryMismatch,
    intakeExceeded,
    institutionComplianceScore = 95
  }) {
    let score = 0;
    const factors = [];

    // Factor 1: Student disputed enrolment (Immediate escalation)
    if (studentDisputed) {
      score += 40;
      factors.push({
        weight: 40,
        factor: 'STUDENT_DISPUTE',
        description: 'Student independently disputed enrolment claim ("Never took admission")'
      });
    }

    // Factor 2: Duplicate enrolment detected across another AICTE institution
    if (duplicateDetected) {
      score += 30;
      factors.push({
        weight: 30,
        factor: 'DUPLICATE_ACROSS_INSTITUTIONS',
        description: 'Same APAAR ID / Student identity active in another institution'
      });
    }

    // Factor 3: APAAR identity verification failed / Ghost record
    if (!apaarVerified) {
      score += 35;
      factors.push({
        weight: 35,
        factor: 'APAAR_IDENTITY_FAILURE',
        description: 'APAAR ID does not exist in master registry or demographic mismatch'
      });
    }

    // Factor 4: Approved Intake Exceeded (Seat Ledger breach)
    if (intakeExceeded) {
      score += 20;
      factors.push({
        weight: 20,
        factor: 'INTAKE_CAP_EXCEEDED',
        description: 'Enrolment exceeds AICTE approved intake for this category'
      });
    }

    // Factor 5: No authentic seat allotment evidence found in JoSAA / CET
    if (!admissionEvidenceFound) {
      score += 15;
      factors.push({
        weight: 15,
        factor: 'NO_ALLOTMENT_RECORD',
        description: 'No matching seat allocation record found in JoSAA/State CET databases'
      });
    }

    // Factor 6: Institution has low historical compliance score (< 80)
    if (institutionComplianceScore < 80) {
      score += 15;
      factors.push({
        weight: 15,
        factor: 'INSTITUTION_COMPLIANCE_DEFICIT',
        description: `Institution compliance rating is ${institutionComplianceScore}% (below 80% baseline)`
      });
    }

    // Factor 7: Seat category mismatch
    if (seatCategoryMismatch) {
      score += 10;
      factors.push({
        weight: 10,
        factor: 'CATEGORY_MISMATCH',
        description: 'Submitted seat category differs from central allocation registry'
      });
    }

    // Factor 8: No joining evidence / fee receipt reference invalid
    if (!joiningEvidenceFound) {
      score += 10;
      factors.push({
        weight: 10,
        factor: 'UNVERIFIED_JOINING_EVIDENCE',
        description: 'Fee transaction reference could not be independently reconciled'
      });
    }

    const clampedScore = Math.min(score, 100);
    let level = 'LOW';
    if (clampedScore >= 70) level = 'CRITICAL';
    else if (clampedScore >= 50) level = 'HIGH';
    else if (clampedScore >= 30) level = 'MEDIUM';

    return {
      riskScore: clampedScore,
      riskLevel: level,
      priorityReview: clampedScore >= 50,
      factors
    };
  }
}

module.exports = RiskScoringEngine;
