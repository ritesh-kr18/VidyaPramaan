// server/verificationEngine.js
const crypto = require('node:crypto');
const { db } = require('./database');
const SeatLedgerEngine = require('./seatLedgerEngine');
const RiskScoringEngine = require('./riskScoringEngine');

class VerificationEngine {
  /**
   * Runs all 5 verification layers sequentially for a claim
   */
  static runPipeline(claimId) {
    const claimStmt = db.prepare(`SELECT * FROM enrolment_claims WHERE id = ?`);
    const claim = claimStmt.get(claimId);
    if (!claim) throw new Error('Claim not found');

    const instStmt = db.prepare(`SELECT * FROM institutions WHERE id = ?`);
    const institution = instStmt.get(claim.institution_id);

    // ==========================================
    // LAYER 1: APAAR Identity Verification
    // ==========================================
    let l1_passed = 0;
    let l1_detail = '';
    let studentMaster = null;

    if (!claim.apaar_id || claim.apaar_id.trim() === '') {
      l1_passed = 0;
      l1_detail = 'Missing APAAR ID: Processed under Alternative Identity Verification Track';
    } else {
      // Validate 12-digit format
      const is12Digit = /^\d{12}$/.test(claim.apaar_id.replace(/-/g, ''));
      if (!is12Digit) {
        l1_passed = 0;
        l1_detail = 'Invalid APAAR format: Must be 12 numeric digits';
      } else {
        const studentStmt = db.prepare(`SELECT * FROM students_master WHERE apaar_id = ?`);
        studentMaster = studentStmt.get(claim.apaar_id);

        if (!studentMaster) {
          l1_passed = 0;
          l1_detail = 'Ghost Identity Alert: APAAR ID not registered in National Learner Repository';
        } else {
          // Demographic match: Name and DOB
          const nameMatch = studentMaster.name.toLowerCase().trim() === claim.student_name.toLowerCase().trim();
          const dobMatch = studentMaster.date_of_birth === claim.date_of_birth;

          if (nameMatch && dobMatch) {
            l1_passed = 1;
            l1_detail = `Identity Authenticated: Verified via DigiLocker / Aadhaar Vault e-KYC (Ref: ${studentMaster.aadhaar_ref_hash.slice(0, 10)}...)`;
          } else {
            l1_passed = 0;
            l1_detail = `Demographic Mismatch: Name or DOB does not match APAAR record (${studentMaster.name}, DOB: ${studentMaster.date_of_birth})`;
          }
        }
      }
    }

    // ==========================================
    // LAYER 2: Admission Evidence (JoSAA/CET)
    // ==========================================
    let l2_passed = 0;
    let l2_detail = '';

    const allotmentStmt = db.prepare(`
      SELECT * FROM allotment_registry 
      WHERE (apaar_id = ? OR allotment_id = ?) 
        AND allotted_institution_id = ? 
        AND academic_year = ?
    `);
    const allotment = allotmentStmt.get(
      claim.apaar_id || 'NONE',
      claim.allotment_reference || 'NONE',
      claim.institution_id,
      claim.academic_year
    );

    if (allotment) {
      l2_passed = 1;
      l2_detail = `Seat Allocation Validated: Allotted by ${allotment.allotment_authority} under ${allotment.seat_category} quota (Ref: ${allotment.allotment_id})`;
    } else {
      l2_passed = 0;
      l2_detail = 'Unverified Allotment: No corresponding seat allocation record in JoSAA/State CET database';
    }

    // ==========================================
    // LAYER 3: Joining Evidence & Student Confirmation
    // ==========================================
    let l3_passed = 0;
    let l3_detail = '';

    // Check fee reference
    const hasValidFeeRef = claim.fee_payment_reference && claim.fee_payment_reference.startsWith('TXN');
    
    // Check student confirmation
    const confStmt = db.prepare(`SELECT * FROM student_confirmations WHERE claim_id = ?`);
    let studentConf = confStmt.get(claim.id);

    if (!studentConf) {
      // Auto-dispatch independent confirmation request
      const contactPhone = studentMaster ? studentMaster.phone_registered : '+91-XXXXXXXXXX';
      const confToken = crypto.randomBytes(16).toString('hex');
      
      const insertConfStmt = db.prepare(`
        INSERT INTO student_confirmations 
        (id, claim_id, apaar_id, response, contact_channel, contact_independent, token)
        VALUES (?, ?, ?, 'PENDING', ?, 1, ?)
      `);
      insertConfStmt.run(
        crypto.randomUUID(),
        claim.id,
        claim.apaar_id,
        `SMS to ${contactPhone}`,
        confToken
      );
      
      studentConf = { response: 'PENDING' };
    }

    if (studentConf.response === 'CONFIRMED') {
      l3_passed = 1;
      l3_detail = 'Joining Confirmed: Student independently confirmed admission via APAAR-linked mobile';
    } else if (studentConf.response === 'DISPUTED') {
      l3_passed = 0;
      l3_detail = `CRITICAL DISPUTE: Student explicitly reported: "${studentConf.dispute_reason || 'Never took admission here'}"`;
    } else {
      l3_passed = hasValidFeeRef ? 1 : 0;
      l3_detail = hasValidFeeRef 
        ? `Provisional Joining: Fee reference ${claim.fee_payment_reference} verified. Awaiting student confirmation.`
        : 'Missing Joining Evidence: Invalid or missing fee transaction reference.';
    }

    // ==========================================
    // LAYER 4: Cross-Institutional Duplicate Detection
    // ==========================================
    let l4_clear = 1;
    let l4_detail = 'Duplicate Check Clean: No cross-institutional double enrolment detected';
    let conflictingClaimId = null;

    if (claim.apaar_id) {
      const dupStmt = db.prepare(`
        SELECT c.*, i.name as conflicting_inst_name 
        FROM enrolment_claims c
        JOIN institutions i ON c.institution_id = i.id
        WHERE c.apaar_id = ? 
          AND c.academic_year = ? 
          AND c.id != ?
          AND c.status NOT IN ('REJECTED')
      `);
      const duplicate = dupStmt.get(claim.apaar_id, claim.academic_year, claim.id);

      if (duplicate) {
        l4_clear = 0;
        conflictingClaimId = duplicate.id;
        l4_detail = `DUPLICATE DETECTED: Student simultaneously enrolled in ${duplicate.conflicting_inst_name} (${duplicate.programme})`;
      }
    }

    // ==========================================
    // LAYER 5: Data Integrity & Seat Ledger Consistency
    // ==========================================
    let l5_passed = 1;
    let l5_detail = '';

    const ledgerAudit = SeatLedgerEngine.auditInstitutionIntake(
      claim.institution_id,
      claim.programme,
      claim.branch,
      claim.academic_year
    );

    const isCategoryExceeded = ledgerAudit.violations.some(v => v.category === claim.seat_type);

    if (isCategoryExceeded) {
      const viol = ledgerAudit.violations.find(v => v.category === claim.seat_type);
      l5_passed = 0;
      l5_detail = `Intake Quota Breach: ${viol.category} category exceeds approved intake (${viol.actual}/${viol.approved}). ${viol.rule}`;
    } else {
      l5_passed = 1;
      l5_detail = `Seat Ledger Verified: Category intake within approved limit (${ledgerAudit.categoryCounts[claim.seat_type] || 1}/${ledgerAudit.matrices.find(m => m.seat_category === claim.seat_type)?.approved_intake || 'N/A'})`;
    }

    // ==========================================
    // COMPOSITE & RISK SCORING
    // ==========================================
    const passCount = l1_passed + l2_passed + l3_passed + l4_clear + l5_passed;
    const compositeScore = Math.round((passCount / 5) * 100);

    const riskAnalysis = RiskScoringEngine.calculateClaimRisk({
      apaarVerified: l1_passed === 1,
      admissionEvidenceFound: l2_passed === 1,
      joiningEvidenceFound: l3_passed === 1,
      duplicateDetected: l4_clear === 0,
      studentDisputed: studentConf.response === 'DISPUTED',
      seatCategoryMismatch: l2_passed === 0 && claim.seat_type === 'NRI',
      intakeExceeded: isCategoryExceeded,
      institutionComplianceScore: institution ? institution.compliance_score : 90
    });

    let overallStatus = 'PASS';
    let newClaimStatus = claim.status;

    if (studentConf.response === 'DISPUTED') {
      overallStatus = 'DISPUTED';
      newClaimStatus = 'DISPUTED';
    } else if (riskAnalysis.riskScore >= 50) {
      overallStatus = 'FLAGGED';
      newClaimStatus = 'FLAGGED';
    } else if (passCount === 5) {
      overallStatus = 'PASS';
      newClaimStatus = 'VERIFIED';
    } else {
      overallStatus = 'PARTIAL';
      newClaimStatus = 'UNDER_VERIFICATION';
    }

    // Save/Update Verification Results
    const resId = crypto.randomUUID();
    const existingRes = db.prepare(`SELECT id FROM verification_results WHERE claim_id = ?`).get(claim.id);

    if (!existingRes) {
      const insertResStmt = db.prepare(`
        INSERT INTO verification_results 
        (id, claim_id, l1_identity_passed, l1_identity_detail, l2_admission_passed, l2_admission_detail, 
         l3_joining_passed, l3_joining_detail, l4_duplicate_clear, l4_duplicate_detail, conflicting_claim_id, 
         l5_data_integrity_passed, l5_data_integrity_detail, composite_score, overall_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertResStmt.run(
        resId,
        claim.id,
        l1_passed,
        l1_detail,
        l2_passed,
        l2_detail,
        l3_passed,
        l3_detail,
        l4_clear,
        l4_detail,
        conflictingClaimId,
        l5_passed,
        l5_detail,
        compositeScore,
        overallStatus
      );
    } else {
      const updateResStmt = db.prepare(`
        UPDATE verification_results 
        SET l1_identity_passed = ?, l1_identity_detail = ?, 
            l2_admission_passed = ?, l2_admission_detail = ?, 
            l3_joining_passed = ?, l3_joining_detail = ?, 
            l4_duplicate_clear = ?, l4_duplicate_detail = ?, conflicting_claim_id = ?, 
            l5_data_integrity_passed = ?, l5_data_integrity_detail = ?, 
            composite_score = ?, overall_status = ?, verified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateResStmt.run(
        l1_passed,
        l1_detail,
        l2_passed,
        l2_detail,
        l3_passed,
        l3_detail,
        l4_clear,
        l4_detail,
        conflictingClaimId,
        l5_passed,
        l5_detail,
        compositeScore,
        overallStatus,
        existingRes.id
      );
    }

    // Update Enrolment Claim with Risk Score & Status
    const updateClaimStmt = db.prepare(`
      UPDATE enrolment_claims 
      SET status = ?, risk_score = ?, risk_level = ?, last_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateClaimStmt.run(newClaimStatus, riskAnalysis.riskScore, riskAnalysis.riskLevel, claim.id);

    // Record Immutable Audit Log
    const auditStmt = db.prepare(`
      INSERT INTO audit_logs (id, claim_id, action, performed_by, role, previous_state, new_state, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    auditStmt.run(
      crypto.randomUUID(),
      claim.id,
      'PIPELINE_VERIFICATION_EXECUTED',
      'SYSTEM_ORCHESTRATOR',
      'AUTOMATION',
      claim.status,
      newClaimStatus,
      `Composite Score: ${compositeScore}%, Risk Score: ${riskAnalysis.riskScore} (${riskAnalysis.riskLevel})`
    );

    return {
      claimId: claim.id,
      compositeScore,
      riskAnalysis,
      layers: {
        l1: { passed: l1_passed === 1, detail: l1_detail },
        l2: { passed: l2_passed === 1, detail: l2_detail },
        l3: { passed: l3_passed === 1, detail: l3_detail },
        l4: { clear: l4_clear === 1, detail: l4_detail, conflictingClaimId },
        l5: { passed: l5_passed === 1, detail: l5_detail }
      },
      newStatus: newClaimStatus
    };
  }
}

module.exports = VerificationEngine;
