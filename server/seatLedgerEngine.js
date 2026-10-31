// server/seatLedgerEngine.js
const { db } = require('./database');
const crypto = require('node:crypto');

class SeatLedgerEngine {
  /**
   * Recalculates category utilization and audits against AICTE APH rules.
   */
  static auditInstitutionIntake(institutionId, programme, branch, academicYear) {
    // 1. Fetch Approved Seat Matrix for this programme
    const matrixStmt = db.prepare(`
      SELECT * FROM seat_matrix 
      WHERE institution_id = ? AND programme = ? AND branch = ? AND academic_year = ?
    `);
    const matrices = matrixStmt.all(institutionId, programme, branch, academicYear);

    // 2. Fetch all non-rejected claims for this institution and programme
    const claimsStmt = db.prepare(`
      SELECT * FROM enrolment_claims 
      WHERE institution_id = ? AND programme = ? AND branch = ? AND academic_year = ?
        AND status NOT IN ('REJECTED')
    `);
    const claims = claimsStmt.all(institutionId, programme, branch, academicYear);

    const violations = [];

    // Category mapping counts
    const categoryCounts = {
      Regular: 0,
      Supernumerary_EWS: 0,
      NRI: 0,
      FN: 0
    };

    claims.forEach(c => {
      if (categoryCounts[c.seat_type] !== undefined) {
        categoryCounts[c.seat_type]++;
      } else {
        categoryCounts.Regular++;
      }
    });

    // Check each category against approved quota
    for (const mat of matrices) {
      const actual = categoryCounts[mat.seat_category] || 0;
      const approved = mat.approved_intake;

      if (actual > approved) {
        const excess = actual - approved;
        let rule = '';
        let severity = 'HIGH';

        if (mat.seat_category === 'Regular') {
          rule = 'AICTE APH 2026-27, Section 3.1 - Approved Intake Violation (Admitting beyond sanctioned capacity)';
          severity = 'CRITICAL';
        } else if (mat.seat_category === 'NRI') {
          rule = 'AICTE APH 2026-27, Section 4.3.2 - Supernumerary NRI/PIO quota exceeds 15% statutory ceiling';
          severity = 'HIGH';
        } else if (mat.seat_category === 'Supernumerary_EWS') {
          rule = 'AICTE APH 2026-27, Section 4.2 - EWS Supernumerary intake exceeds 10% ceiling';
          severity = 'HIGH';
        } else {
          rule = 'AICTE APH 2026-27, Section 4.4 - Foreign National (FN) seat quota breach';
          severity = 'MEDIUM';
        }

        // Check if violation already recorded
        const existingStmt = db.prepare(`
          SELECT id FROM intake_violations 
          WHERE institution_id = ? AND programme = ? AND branch = ? AND category = ? AND academic_year = ?
        `);
        const existing = existingStmt.get(institutionId, programme, branch, mat.seat_category, academicYear);

        if (!existing) {
          const insertStmt = db.prepare(`
            INSERT INTO intake_violations 
            (id, institution_id, programme, branch, academic_year, category, approved_intake, actual_enrolled, excess_count, regulatory_rule, severity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insertStmt.run(
            crypto.randomUUID(),
            institutionId,
            programme,
            branch,
            academicYear,
            mat.seat_category,
            approved,
            actual,
            excess,
            rule,
            severity
          );
        } else {
          const updateStmt = db.prepare(`
            UPDATE intake_violations 
            SET actual_enrolled = ?, excess_count = ?, regulatory_rule = ?, severity = ?
            WHERE id = ?
          `);
          updateStmt.run(actual, excess, rule, severity, existing.id);
        }

        violations.push({
          category: mat.seat_category,
          approved,
          actual,
          excess,
          rule,
          severity
        });
      }
    }

    return {
      institutionId,
      programme,
      branch,
      academicYear,
      categoryCounts,
      matrices,
      violations
    };
  }

  /**
   * Fetches national aggregated ledger stats for AICTE
   */
  static getNationalSeatLedger() {
    const totalApprovedStmt = db.prepare(`SELECT SUM(approved_intake) as total_approved FROM seat_matrix`);
    const totalApproved = totalApprovedStmt.get()?.total_approved || 0;

    const totalEnrolledStmt = db.prepare(`
      SELECT COUNT(*) as total_enrolled 
      FROM enrolment_claims 
      WHERE status NOT IN ('REJECTED')
    `);
    const totalEnrolled = totalEnrolledStmt.get()?.total_enrolled || 0;

    const violationsStmt = db.prepare(`
      SELECT iv.*, i.name as institution_name, i.aicte_id
      FROM intake_violations iv
      JOIN institutions i ON iv.institution_id = i.id
      ORDER BY iv.detected_at DESC
    `);
    const violations = violationsStmt.all();

    return {
      totalApproved,
      totalEnrolled,
      violationsCount: violations.length,
      violations
    };
  }
}

module.exports = SeatLedgerEngine;
