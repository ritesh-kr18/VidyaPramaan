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

  /**
   * Section 5.5 & 7: Institution Anomaly Detector
   * Evaluates 10 institutional features and returns anomaly score,
   * anomaly flag, and explainable factors.
   */
  static detectInstitutionAnomaly(features) {
    const {
      institutionId,
      institutionName = 'Unknown',
      intakeUtilizationPct = 100,
      nriPct = 5,
      supernumeraryPct = 5,
      duplicateRate = 0,
      disputeRate = 0,
      avgVerificationPassRate = 0.95,
      lateSubmissionFlag = 0,
      historicalViolationCount = 0,
      dataQualityScore = 0.95
    } = features;

    let anomalyScore = 0;
    const factors = [];

    // Over-admitting check
    if (intakeUtilizationPct > 105) {
      const penalty = Math.min(35, Math.round((intakeUtilizationPct - 100) * 1.5));
      anomalyScore += penalty;
      factors.push(`Intake utilization ${intakeUtilizationPct}% exceeds sanctioned 100% cap (+${penalty})`);
    }

    // High dispute rate (> 5%)
    if (disputeRate > 0.05) {
      anomalyScore += 30;
      factors.push(`High student dispute rate ${(disputeRate * 100).toFixed(1)}% (Threshold: 5%) (+30)`);
    }

    // High duplicate rate (> 2%)
    if (duplicateRate > 0.02) {
      anomalyScore += 25;
      factors.push(`Abnormal cross-institution duplicate rate ${(duplicateRate * 100).toFixed(1)}% (+25)`);
    }

    // Excessive NRI proportion (> 15% statutory cap)
    if (nriPct > 15) {
      anomalyScore += 20;
      factors.push(`NRI admissions ${nriPct.toFixed(1)}% violate 15% statutory cap (APH Section 4.3.2) (+20)`);
    }

    // Low verification pass rate (< 75%)
    if (avgVerificationPassRate < 0.75) {
      anomalyScore += 15;
      factors.push(`Low automated 5-layer verification pass rate ${(avgVerificationPassRate * 100).toFixed(1)}% (+15)`);
    }

    // Historical violations (> 2)
    if (historicalViolationCount > 2) {
      anomalyScore += 15;
      factors.push(`${historicalViolationCount} prior regulatory violations on record (+15)`);
    }

    // Poor data quality / missing APAAR rate
    if (dataQualityScore < 0.8) {
      anomalyScore += 10;
      factors.push(`Data quality score ${(dataQualityScore * 100).toFixed(0)}% below 80% baseline (+10)`);
    }

    const clampedScore = Math.min(anomalyScore, 100);
    const isAnomaly = clampedScore >= 50;

    let riskLevel = 'LOW';
    if (clampedScore >= 70) riskLevel = 'CRITICAL';
    else if (clampedScore >= 50) riskLevel = 'HIGH';
    else if (clampedScore >= 30) riskLevel = 'MEDIUM';

    return {
      institutionId,
      institutionName,
      anomalyScore: clampedScore,
      isAnomaly,
      riskLevel,
      factors,
      requiresRegulatoryAudit: isAnomaly,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = RiskScoringEngine;

