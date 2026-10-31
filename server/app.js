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
app.get('/api/institutions', (req, res) => {
  const rows = db.prepare(`SELECT * FROM institutions ORDER BY name ASC`).all();
  res.json({ success: true, data: rows });
});

// Institution summary & claims stats
app.get('/api/institutions/:id/summary', (req, res) => {
  const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(req.params.id);
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
  `).get(req.params.id);

  const violations = db.prepare(`
    SELECT * FROM intake_violations WHERE institution_id = ?
  `).all(req.params.id);

  res.json({
    success: true,
    institution: inst,
    stats,
    violations
  });
});

// List institution claims with 5-layer results
app.get('/api/institutions/:id/claims', (req, res) => {
  const claims = db.prepare(`
    SELECT c.*, vr.l1_identity_passed, vr.l2_admission_passed, vr.l3_joining_passed, 
           vr.l4_duplicate_clear, vr.l5_data_integrity_passed, vr.composite_score,
           sc.response as student_confirmation_status, sc.dispute_reason
    FROM enrolment_claims c
    LEFT JOIN verification_results vr ON c.id = vr.claim_id
    LEFT JOIN student_confirmations sc ON c.id = sc.claim_id
    WHERE c.institution_id = ?
    ORDER BY c.submitted_at DESC
  `).all(req.params.id);

  res.json({ success: true, claims });
});

// Institution Seat Matrix Ledger
app.get('/api/institutions/:id/seat-matrix', (req, res) => {
  const matrices = db.prepare(`
    SELECT * FROM seat_matrix WHERE institution_id = ?
  `).all(req.params.id);

  // Compute live enrolled counts per category
  const counts = db.prepare(`
    SELECT seat_type, COUNT(*) as enrolled 
    FROM enrolment_claims 
    WHERE institution_id = ? AND status NOT IN ('REJECTED')
    GROUP BY seat_type
  `).all(req.params.id);

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
app.post('/api/claims', (req, res) => {
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

  res.json({
    success: true,
    message: 'Claim registered and verified via 5-layer engine',
    claimId,
    humanClaimId,
    pipelineResult
  });
});

// Bulk CSV/Array Claim Upload
app.post('/api/claims/bulk', (req, res) => {
  const { institution_id, records } = req.body;
  if (!institution_id || !Array.isArray(records)) {
    return res.status(400).json({ success: false, error: 'Expected institution_id and records array' });
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
        rec.date_of_birth,
        rec.gender || 'Male',
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

// National KPIs
app.get('/api/aicte/national-kpis', (req, res) => {
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

// AICTE Priority Risk Review Queue (Risk >= 50 or FLAGGED / DISPUTED)
app.get('/api/aicte/risk-queue', (req, res) => {
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

// Deep Case Review Endpoint for AICTE Officers
app.get('/api/aicte/claims/:id', (req, res) => {
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

// Officer Decision & Adjudication Endpoint
app.post('/api/aicte/claims/:id/adjudicate', (req, res) => {
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

// National Seat Ledger & Violations
app.get('/api/aicte/seat-ledger', (req, res) => {
  const ledger = SeatLedgerEngine.getNationalSeatLedger();
  res.json({ success: true, ...ledger });
});

// Full Audit Trail
app.get('/api/aicte/audit-logs', (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50
  `).all();
  res.json({ success: true, logs });
});

// ========================================================
// 3. STUDENT PORTAL ROUTES
// ========================================================

// Fetch student details by APAAR ID
app.get('/api/student/:apaarId', (req, res) => {
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

// Student Independent Confirmation Action (CONFIRM or DISPUTE)
app.post('/api/student/confirmations/:claimId', (req, res) => {
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
app.get('/api/student/:apaarId/credentials', (req, res) => {
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

// ========================================================
// 4. PUBLIC CREDENTIAL VERIFIER ROUTE
// ========================================================

app.get('/api/verify/:code', (req, res) => {
  const result = CredentialService.verifyCredential(req.params.code);
  res.json(result);
});

// ========================================================
// 5. DEMO SCENARIO SHORTCUTS & RESET
// ========================================================

app.post('/api/demo/reset', (req, res) => {
  seedDatabase();
  res.json({ success: true, message: 'Database reset to initial clean demo state' });
});

// Initial boot seeding if empty
const count = db.prepare(`SELECT COUNT(*) as count FROM institutions`).get()?.count || 0;
if (count === 0) {
  seedDatabase();
}

app.listen(PORT, () => {
  console.log(`🚀 VidyaPramaan Server running on http://localhost:${PORT}`);
});

module.exports = app;
