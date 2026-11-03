// server/app.js
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const crypto = require('node:crypto');
const { db } = require('./database');
const VerificationEngine = require('./verificationEngine');
const SeatLedgerEngine = require('./seatLedgerEngine');
const CredentialService = require('./credentialService');
const { seedDatabase } = require('./seedData');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ========================================================
// 1. INSTITUTION PORTAL ROUTES
// ========================================================

// List institutions
app.get(['/api/institutions', '/api/v1/institutions'], (req, res) => {
  const rows = db.prepare(`SELECT * FROM institutions ORDER BY name ASC`).all();
  res.json({ success: true, data: rows });
});

// Institution summary & claims stats
app.get(['/api/institutions/:id/summary', '/api/v1/claims/stats'], (req, res) => {
  const instId = req.params.id || req.query.institution_id || 'inst_abc';
  const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(instId);
  if (!inst) return res.status(404).json({ success: false, error: 'Institution not found' });

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_claims,
      SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN status = 'COUNTERSIGNED' THEN 1 ELSE 0 END) as countersigned_count,
      SUM(CASE WHEN status = 'FLAGGED' THEN 1 ELSE 0 END) as flagged_count,
      SUM(CASE WHEN status = 'DISPUTED' THEN 1 ELSE 0 END) as disputed_count,
      SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_count,
      AVG(risk_score) as avg_risk_score
    FROM enrolment_claims
    WHERE institution_id = ?
  `).get(instId);

  const violations = db.prepare(`
    SELECT * FROM intake_violations WHERE institution_id = ?
  `).all(instId);

  res.json({
    success: true,
    institution: inst,
    stats,
    violations
  });
});

// List institution claims with 5-layer results
app.get(['/api/institutions/:id/claims', '/api/v1/claims'], (req, res) => {
  const instId = req.params.id || req.query.institution_id || 'inst_abc';
  const claims = db.prepare(`
    SELECT c.*, vr.l1_identity_passed, vr.l2_admission_passed, vr.l3_joining_passed, 
           vr.l4_duplicate_clear, vr.l5_data_integrity_passed, vr.composite_score,
           sc.response as student_confirmation_status, sc.dispute_reason
    FROM enrolment_claims c
    LEFT JOIN verification_results vr ON c.id = vr.claim_id
    LEFT JOIN student_confirmations sc ON c.id = sc.claim_id
    WHERE c.institution_id = ?
    ORDER BY c.submitted_at DESC
  `).all(instId);

  res.json({ success: true, claims });
});

// Institution Seat Matrix Ledger
app.get(['/api/institutions/:id/seat-matrix', '/api/v1/seat-ledger/:id'], (req, res) => {
  const instId = req.params.id;
  const matrices = db.prepare(`
    SELECT * FROM seat_matrix WHERE institution_id = ?
  `).all(instId);

  // Compute live enrolled counts per category
  const counts = db.prepare(`
    SELECT seat_type, COUNT(*) as enrolled 
    FROM enrolment_claims 
    WHERE institution_id = ? AND status NOT IN ('REJECTED')
    GROUP BY seat_type
  `).all(instId);

  const countMap = {};
  counts.forEach(c => { countMap[c.seat_type] = c.enrolled; });

  const enriched = matrices.map(m => {
    const enrolled = countMap[m.seat_category] || 0;
    const vacant = Math.max(0, m.approved_intake - enrolled);
    const excess = Math.max(0, enrolled - m.approved_intake);
    return {
      ...m,
      enrolled,
      vacant,
      excess,
      utilizationPct: Math.round((enrolled / m.approved_intake) * 100),
      isBreached: excess > 0
    };
  });

  res.json({ success: true, seatMatrix: enriched });
});

// Single Claim Submission
app.post(['/api/claims', '/api/v1/claims'], (req, res) => {
  const {
    institution_id,
    apaar_id,
    student_name,
    date_of_birth,
    gender,
    programme = 'B.Tech',
    branch = 'Computer Science and Engineering',
    academic_year = '2026-27',
    seat_type = 'Regular',
    admission_category = 'Open',
    allotment_authority = 'State CET Cell',
    allotment_reference = 'CET-REF-' + Math.floor(Math.random() * 90000 + 10000),
    fee_payment_reference = 'TXN' + Date.now().toString().slice(-8)
  } = req.body;

  if (!institution_id || !student_name || !date_of_birth) {
    return res.status(400).json({ success: false, error: 'Missing required student fields' });
  }

  const claimId = crypto.randomUUID();
  const humanClaimId = 'VP-2026-' + Math.floor(Math.random() * 900000 + 100000);
  const hash = crypto.createHash('sha256').update(JSON.stringify(req.body) + Date.now()).digest('hex');

  const insertStmt = db.prepare(`
    INSERT INTO enrolment_claims 
    (id, claim_id, institution_id, apaar_id, student_name, date_of_birth, gender, programme, branch, academic_year, seat_type, admission_category, allotment_authority, allotment_reference, fee_payment_reference, status, submission_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
  `);

  insertStmt.run(
    claimId,
    humanClaimId,
    institution_id,
    apaar_id || null,
    student_name,
    date_of_birth,
    gender || 'Not Specified',
    programme,
    branch,
    academic_year,
    seat_type,
    admission_category,
    allotment_authority,
    allotment_reference,
    fee_payment_reference,
    hash
  );

  // Immediately run 5-layer verification pipeline
  const pipelineResult = VerificationEngine.runPipeline(claimId);
  if (pipelineResult.newStatus === 'VERIFIED') {
    try {
      CredentialService.issueCredential(claimId);
    } catch (e) {
      console.error('Auto-mint on single claim error:', e.message);
    }
  }

  res.json({
    success: true,
    message: 'Claim registered and verified via 5-layer engine',
    claimId,
    humanClaimId,
    pipelineResult
  });
});

// Download CSV Upload Template (Section 9.2)
app.get(['/api/claims/template', '/api/v1/claims/template'], (req, res) => {
  const headers = [
    'apaar_id',
    'student_name',
    'date_of_birth',
    'gender',
    'programme',
    'branch',
    'academic_year',
    'seat_type',
    'admission_category',
    'allotment_authority',
    'allotment_reference',
    'fee_payment_reference'
  ];

  const sampleRows = [
    '910248193820,Rohan Sharma,2004-05-15,Male,B.Tech,Computer Science and Engineering,2026-27,Regular,Open,State CET Cell,CET-REF-10294,TXN8201948',
    '820194827103,Ananya Verma,2004-11-20,Female,B.Tech,Computer Science and Engineering,2026-27,Regular,Open,State CET Cell,CET-REF-84920,TXN4820194',
    '640192837465,Priya Patel,2004-03-30,Female,B.Tech,Computer Science and Engineering,2026-27,Regular,Open,State CET Cell,CET-REF-55912,TXN9910293'
  ];

  const csvContent = headers.join(',') + '\n' + sampleRows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vidyapramaan_claims_template.csv"');
  res.send(csvContent);
});

// Simple CSV text parser helper
function parseCsvToRecords(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const rec = {};
    headers.forEach((h, idx) => {
      rec[h] = values[idx] || '';
    });
    if (rec.student_name) {
      records.push(rec);
    }
  }
  return records;
}

// Bulk CSV/Array Claim Upload (Section 5.1 & 9.2)
app.post(['/api/claims/bulk', '/api/v1/claims/bulk'], (req, res) => {
  let { institution_id, records, csv_data } = req.body;

  // Support direct CSV text in payload
  if (!records && csv_data) {
    records = parseCsvToRecords(csv_data);
  } else if (!records && typeof req.body === 'string' && req.body.includes(',')) {
    records = parseCsvToRecords(req.body);
  }

  if (!institution_id || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Expected institution_id and a valid records array or csv_data text with headers' 
    });
  }

  const results = [];
  records.forEach(rec => {
    try {
      const claimId = crypto.randomUUID();
      const humanClaimId = 'VP-2026-' + Math.floor(Math.random() * 900000 + 100000);
      const hash = crypto.createHash('sha256').update(JSON.stringify(rec) + Date.now()).digest('hex');

      db.prepare(`
        INSERT INTO enrolment_claims 
        (id, claim_id, institution_id, apaar_id, student_name, date_of_birth, gender, programme, branch, academic_year, seat_type, admission_category, allotment_authority, allotment_reference, fee_payment_reference, status, submission_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
      `).run(
        claimId,
        humanClaimId,
        institution_id,
        rec.apaar_id || null,
        rec.student_name,
        rec.date_of_birth || '2004-01-01',
        rec.gender || 'Not Specified',
        rec.programme || 'B.Tech',
        rec.branch || 'Computer Science and Engineering',
        rec.academic_year || '2026-27',
        rec.seat_type || 'Regular',
        rec.admission_category || 'Open',
        rec.allotment_authority || 'State CET',
        rec.allotment_reference || 'REF-' + Math.floor(Math.random() * 9000),
        rec.fee_payment_reference || 'TXN' + Math.floor(Math.random() * 9000000),
        hash
      );

      const verification = VerificationEngine.runPipeline(claimId);
      if (verification.newStatus === 'VERIFIED') {
        try {
          CredentialService.issueCredential(claimId);
        } catch (e) {
          console.error('Auto-mint on bulk claim error:', e.message);
        }
      }

      results.push({
        claimId,
        humanClaimId,
        studentName: rec.student_name,
        apaarId: rec.apaar_id,
        status: verification.newStatus,
        riskScore: verification.riskAnalysis.riskScore,
        riskLevel: verification.riskAnalysis.riskLevel
      });
    } catch (err) {
      results.push({
        studentName: rec.student_name,
        status: 'ERROR',
        error: err.message
      });
    }
  });

  res.json({
    success: true,
    totalUploaded: records.length,
    processed: results
  });
});

// ========================================================
// 2. AICTE CENTRAL COMMAND DASHBOARD ROUTES
// ========================================================

// National KPIs (Section 8.2 & 9.6)
app.get(['/api/aicte/national-kpis', '/api/v1/analytics/national'], (req, res) => {
  const totalInst = db.prepare(`SELECT COUNT(*) as count FROM institutions`).get().count;
  const totalClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims`).get().count;
  const verifiedClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims WHERE status IN ('VERIFIED', 'COUNTERSIGNED')`).get().count;
  const disputedClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims WHERE status = 'DISPUTED'`).get().count;
  const flaggedClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims WHERE status = 'FLAGGED'`).get().count;
  const duplicateAlerts = db.prepare(`SELECT COUNT(*) as count FROM verification_results WHERE l4_duplicate_clear = 0`).get().count;
  const activeViolations = db.prepare(`SELECT COUNT(*) as count FROM intake_violations`).get().count;
  const credentialsIssued = db.prepare(`SELECT COUNT(*) as count FROM verifiable_credentials`).get().count;

  res.json({
    success: true,
    kpis: {
      totalInstitutions: totalInst,
      totalClaims,
      verifiedClaims,
      verificationRate: totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 100) : 0,
      disputedClaims,
      flaggedClaims,
      duplicateAlerts,
      activeViolations,
      credentialsIssued
    }
  });
});

// AICTE Priority Risk Review Queue (Section 8.2 & 9.2)
app.get(['/api/aicte/risk-queue', '/api/v1/claims/review-queue', '/api/v1/claims/flagged'], (req, res) => {
  const queue = db.prepare(`
    SELECT c.*, i.name as institution_name, i.aicte_id,
           vr.l1_identity_passed, vr.l2_admission_passed, vr.l3_joining_passed, 
           vr.l4_duplicate_clear, vr.l5_data_integrity_passed, vr.composite_score,
           vr.l1_identity_detail, vr.l2_admission_detail, vr.l3_joining_detail, 
           vr.l4_duplicate_detail, vr.l5_data_integrity_detail,
           sc.response as student_confirmation, sc.dispute_reason
    FROM enrolment_claims c
    JOIN institutions i ON c.institution_id = i.id
    LEFT JOIN verification_results vr ON c.id = vr.claim_id
    LEFT JOIN student_confirmations sc ON c.id = sc.claim_id
    WHERE c.risk_score >= 40 OR c.status IN ('FLAGGED', 'DISPUTED')
    ORDER BY c.risk_score DESC, c.submitted_at DESC
  `).all();

  res.json({ success: true, count: queue.length, queue });
});

// Deep Case Review Endpoint for AICTE Officers (Section 8.2 & 9.2)
app.get(['/api/aicte/claims/:id', '/api/v1/claims/:id'], (req, res) => {
  const claim = db.prepare(`
    SELECT c.*, i.name as institution_name, i.aicte_id, i.compliance_score as inst_compliance,
           vr.l1_identity_passed, vr.l1_identity_detail,
           vr.l2_admission_passed, vr.l2_admission_detail,
           vr.l3_joining_passed, vr.l3_joining_detail,
           vr.l4_duplicate_clear, vr.l4_duplicate_detail, vr.conflicting_claim_id,
           vr.l5_data_integrity_passed, vr.l5_data_integrity_detail,
           vr.composite_score,
           sc.response as student_confirmation, sc.dispute_reason, sc.contact_channel,
           vc.verification_code, vc.status as vc_status
    FROM enrolment_claims c
    JOIN institutions i ON c.institution_id = i.id
    LEFT JOIN verification_results vr ON c.id = vr.claim_id
    LEFT JOIN student_confirmations sc ON c.id = sc.claim_id
    LEFT JOIN verifiable_credentials vc ON c.id = vc.claim_id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

  // Conflicting duplicate claim if exists
  let conflictingClaim = null;
  if (claim.conflicting_claim_id) {
    conflictingClaim = db.prepare(`
      SELECT c.*, i.name as conflicting_inst_name 
      FROM enrolment_claims c 
      JOIN institutions i ON c.institution_id = i.id 
      WHERE c.id = ?
    `).get(claim.conflicting_claim_id);
  }

  // Audit history
  const history = db.prepare(`
    SELECT * FROM audit_logs WHERE claim_id = ? ORDER BY timestamp DESC
  `).all(req.params.id);

  res.json({
    success: true,
    claim,
    conflictingClaim,
    history
  });
});

// Officer Decision & Adjudication Endpoint (Section 8.2 & 9.2)
app.post(['/api/aicte/claims/:id/adjudicate', '/api/v1/claims/:id/review'], (req, res) => {
  const { decision, reason, officer_name = 'Dr. AICTE Regulatory Officer' } = req.body;
  // decision: COUNTERSIGN, REJECT, AUDIT_REQUEST
  const claim = db.prepare(`SELECT * FROM enrolment_claims WHERE id = ?`).get(req.params.id);
  if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

  let newStatus = claim.status;
  let issuedCred = null;

  if (decision === 'COUNTERSIGN') {
    newStatus = 'COUNTERSIGNED';
    // Issue cryptographically signed W3C Verifiable Credential
    issuedCred = CredentialService.issueCredential(claim.id);
  } else if (decision === 'REJECT') {
    newStatus = 'REJECTED';
  } else if (decision === 'AUDIT_REQUEST') {
    newStatus = 'UNDER_INVESTIGATION';
  }

  db.prepare(`
    UPDATE enrolment_claims 
    SET status = ?, last_updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(newStatus, claim.id);

  // Record accountable human officer decision in audit log
  db.prepare(`
    INSERT INTO audit_logs (id, claim_id, action, performed_by, role, previous_state, new_state, reason)
    VALUES (?, ?, ?, ?, 'AICTE_OFFICER', ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    claim.id,
    `OFFICER_DECISION_${decision}`,
    officer_name,
    claim.status,
    newStatus,
    reason || 'Official AICTE regulatory adjudication'
  );

  res.json({
    success: true,
    decision,
    newStatus,
    verifiableCredential: issuedCred
  });
});

// National Seat Ledger & Violations (Section 8.2 & 9.4)
app.get(['/api/aicte/seat-ledger', '/api/v1/seat-ledger/national', '/api/v1/seat-ledger/violations'], (req, res) => {
  const ledger = SeatLedgerEngine.getNationalSeatLedger();
  res.json({ success: true, ...ledger });
});

// Officer Request Supplementary Info (Section 9.2)
app.post(['/api/aicte/claims/:id/request-info', '/api/v1/claims/:id/request-info'], (req, res) => {
  const { notes, requested_documents } = req.body;
  const claim = db.prepare(`SELECT * FROM enrolment_claims WHERE id = ?`).get(req.params.id);
  if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

  db.prepare(`
    INSERT INTO audit_logs (id, claim_id, action, performed_by, role, previous_state, new_state, reason)
    VALUES (?, ?, 'OFFICER_REQUEST_INFO', 'AICTE Review Officer', 'AICTE_OFFICER', ?, 'UNDER_INVESTIGATION', ?)
  `).run(
    crypto.randomUUID(),
    claim.id,
    claim.status,
    notes || `Requested supplementary proof: ${requested_documents || 'Admission & Fee verification'}`
  );

  db.prepare(`UPDATE enrolment_claims SET status = 'UNDER_INVESTIGATION' WHERE id = ?`).run(claim.id);

  res.json({
    success: true,
    message: 'Information request officially dispatched to institution. Claim placed in UNDER_INVESTIGATION state.',
    claimId: claim.id
  });
});

// Re-run Verification Pipeline (Section 9.3)
app.post(['/api/verification/:claimId/rerun', '/api/v1/verification/:claimId/rerun'], (req, res) => {
  try {
    const pipelineResult = VerificationEngine.runPipeline(req.params.claimId);
    res.json({
      success: true,
      message: '5-Layer Verification pipeline re-executed successfully',
      pipelineResult
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// National Reports Generator (Section 8.2 & 9.6)
app.get(['/api/reports/generate', '/api/v1/reports/generate'], (req, res) => {
  const { format = 'json' } = req.query;

  const totalClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims`).get().count;
  const verifiedClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims WHERE status IN ('VERIFIED', 'COUNTERSIGNED')`).get().count;
  const disputedClaims = db.prepare(`SELECT COUNT(*) as count FROM enrolment_claims WHERE status = 'DISPUTED'`).get().count;
  const violations = db.prepare(`SELECT * FROM intake_violations`).all();
  const institutions = db.prepare(`SELECT * FROM institutions`).all();

  const report = {
    generatedAt: new Date().toISOString(),
    title: 'AICTE National Academic Enrolment & Compliance Audit Report',
    academicYear: '2026-27',
    summary: {
      totalInstitutions: institutions.length,
      totalClaims,
      verifiedClaims,
      disputedClaims,
      activeViolations: violations.length,
      nationalVerificationRate: totalClaims > 0 ? ((verifiedClaims / totalClaims) * 100).toFixed(1) + '%' : '0%'
    },
    intakeViolations: violations,
    institutionsSummary: institutions.map(i => ({
      name: i.name,
      aicteId: i.aicte_id,
      complianceScore: i.compliance_score + '%',
      state: i.state
    }))
  };

  if (format === 'csv') {
    let csv = 'Institution,AICTE ID,Category,Approved,Enrolled,Excess,Rule,Severity\n';
    violations.forEach(v => {
      csv += `"${v.institution_id}","${v.aicte_id || ''}","${v.category}",${v.approved_intake},${v.actual_enrolled},${v.excess_count},"${v.regulatory_rule}","${v.severity}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="aicte_compliance_report.csv"');
    return res.send(csv);
  }

  res.json({ success: true, report });
});

// ========================================================
// AI/ML ANOMALY DETECTION APIS (Section 5.5, 7 & 9.8)
// ========================================================

// Institution Anomaly Detection (Isolation Forest / Factor Engine)
app.post(['/api/ml/institution-anomaly', '/api/v1/ml/institution-anomaly'], (req, res) => {
  const result = RiskScoringEngine.detectInstitutionAnomaly(req.body);
  res.json({ success: true, ...result });
});

// Claim Risk Scoring
app.post(['/api/ml/claim-risk-score', '/api/v1/ml/claim-risk-score'], (req, res) => {
  const result = RiskScoringEngine.calculateClaimRisk(req.body);
  res.json({ success: true, ...result });
});

// Batch Claim Risk Scoring
app.post(['/api/ml/batch-risk-score', '/api/v1/ml/batch-risk-score'], (req, res) => {
  const claims = req.body.claims || req.body;
  if (!Array.isArray(claims)) {
    return res.status(400).json({ success: false, error: 'Expected array of claims' });
  }
  const results = claims.map(c => RiskScoringEngine.calculateClaimRisk(c));
  res.json({ success: true, count: results.length, results });
});

// ========================================================
// 3. STUDENT PORTAL ROUTES
// ========================================================

// Fetch student details by APAAR ID (Section 8.3 & 9.5)
app.get(['/api/student/:apaarId', '/api/v1/student/enrolments/:apaarId'], (req, res) => {
  const student = db.prepare(`SELECT * FROM students_master WHERE apaar_id = ?`).get(req.params.apaarId);
  if (!student) return res.status(404).json({ success: false, error: 'Student not found in APAAR master registry' });

  const claims = db.prepare(`
    SELECT c.*, i.name as institution_name, i.aicte_id,
           sc.response as confirmation_status, sc.dispute_reason,
           vc.verification_code
    FROM enrolment_claims c
    JOIN institutions i ON c.institution_id = i.id
    LEFT JOIN student_confirmations sc ON c.id = sc.claim_id
    LEFT JOIN verifiable_credentials vc ON c.id = vc.claim_id
    WHERE c.apaar_id = ?
    ORDER BY c.submitted_at DESC
  `).all(req.params.apaarId);

  res.json({
    success: true,
    student,
    claims
  });
});

// Student Independent Confirmation Action (CONFIRM or DISPUTE) (Section 8.3 & 9.5)
app.post(['/api/student/confirmations/:claimId', '/api/v1/confirmations/:claimId'], (req, res) => {
  const { response, dispute_reason } = req.body; // response: CONFIRMED or DISPUTED
  const claim = db.prepare(`SELECT * FROM enrolment_claims WHERE id = ?`).get(req.params.claimId);
  if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

  // Update or insert confirmation
  const existingConf = db.prepare(`SELECT id FROM student_confirmations WHERE claim_id = ?`).get(claim.id);
  if (existingConf) {
    db.prepare(`
      UPDATE student_confirmations 
      SET response = ?, dispute_reason = ?, responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(response, dispute_reason || null, existingConf.id);
  } else {
    db.prepare(`
      INSERT INTO student_confirmations 
      (id, claim_id, apaar_id, response, dispute_reason, contact_channel, contact_independent, responded_at, token)
      VALUES (?, ?, ?, ?, ?, 'Independent Student Portal', 1, CURRENT_TIMESTAMP, ?)
    `).run(
      crypto.randomUUID(),
      claim.id,
      claim.apaar_id,
      response,
      dispute_reason || null,
      crypto.randomBytes(8).toString('hex')
    );
  }

  // Re-run pipeline to update risk scoring and freeze claim if disputed
  const pipelineResult = VerificationEngine.runPipeline(claim.id);

  // Record audit log
  db.prepare(`
    INSERT INTO audit_logs (id, claim_id, action, performed_by, role, previous_state, new_state, reason)
    VALUES (?, ?, ?, ?, 'STUDENT', ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    claim.id,
    `STUDENT_RESPONSE_${response}`,
    claim.student_name,
    claim.status,
    pipelineResult.newStatus,
    dispute_reason || 'Student confirmed admission record'
  );

  res.json({
    success: true,
    message: response === 'DISPUTED' 
      ? 'Admission disputed! Claim has been frozen and escalated to AICTE Priority Review Queue.' 
      : 'Enrolment confirmed successfully by student.',
    pipelineResult
  });
});

// Fetch student credentials (W3C VCs)
app.get(['/api/student/:apaarId/credentials', '/api/v1/student/:apaarId/credentials'], (req, res) => {
  const creds = db.prepare(`
    SELECT vc.*, c.programme, c.branch, c.academic_year
    FROM verifiable_credentials vc
    JOIN enrolment_claims c ON vc.claim_id = c.id
    WHERE vc.apaar_id = ?
    ORDER BY vc.issued_at DESC
  `).all(req.params.apaarId);

  const enriched = creds.map(c => ({
    ...c,
    qrSvg: CredentialService.generateQrSvg(c.verification_code, c.student_name, c.institution_name)
  }));

  res.json({ success: true, credentials: enriched });
});

// Selective Disclosure Sharing (Section 8.3, 9.5 & 12)
app.post(['/api/student/credentials/:code/share', '/api/v1/credentials/:code/share'], (req, res) => {
  try {
    const { disclosed_fields = [] } = req.body;
    const presentation = CredentialService.createSelectivePresentation(req.params.code, disclosed_fields);
    res.json({
      success: true,
      message: 'Selective disclosure presentation token generated with cryptographic signature',
      presentation
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Full Audit Trail (Section 9.2)
app.get(['/api/aicte/audit-logs', '/api/v1/claims/audit-logs'], (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50
  `).all();
  res.json({ success: true, logs });
});

// ========================================================
// 4. PUBLIC CREDENTIAL VERIFIER ROUTE
// ========================================================

app.get(['/api/verify/:code', '/api/v1/verify/:code'], (req, res) => {
  const result = CredentialService.verifyCredential(req.params.code);
  res.json(result);
});

// Get latest minted credential (for verifier convenience)
app.get('/api/credentials/latest', (req, res) => {
  const cred = db.prepare(`
    SELECT vc.*, c.student_name 
    FROM verifiable_credentials vc
    JOIN enrolment_claims c ON vc.claim_id = c.id
    ORDER BY vc.issued_at DESC LIMIT 1
  `).get();
  res.json({ success: true, credential: cred || null });
});

// ==========================================
// 5. DEMO SCENARIO SHORTCUTS & RESET
// ==========================================

// Reset to clean 0-claims state (Prong 1: completely clean before uploading demo data)
app.post('/api/demo/reset', (req, res) => {
  seedDatabase({ withClaims: false });
  res.json({ 
    success: true, 
    message: 'System reset to pristine clean state (0 claims). Nothing about student data is visible until demo CSV is uploaded.' 
  });
});

// Seed pre-staged regulatory scenarios on demand
app.post('/api/demo/seed-scenarios', (req, res) => {
  seedDatabase({ withClaims: true });
  res.json({ 
    success: true, 
    message: 'Pre-staged regulatory inspection scenarios loaded successfully.' 
  });
});

// Initial boot seeding: always start with master ecosystem and ZERO claims visible
seedDatabase({ withClaims: false });

app.listen(PORT, () => {
  console.log(`🚀 VidyaPramaan Server running on http://localhost:${PORT}`);
  console.log(`✨ Initial state: 0 claims visible. Ready for live demo CSV upload.`);
});

module.exports = app;
