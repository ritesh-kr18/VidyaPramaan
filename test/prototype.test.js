// test/prototype.test.js
const assert = require('node:assert');
const { db } = require('../server/database');
const { seedDatabase, clearAllClaims } = require('../server/seedData');
const VerificationEngine = require('../server/verificationEngine');
const SeatLedgerEngine = require('../server/seatLedgerEngine');
const RiskScoringEngine = require('../server/riskScoringEngine');
const CredentialService = require('../server/credentialService');

console.log('🧪 Starting VidyaPramaan Automated Prototype Verification Suite...\n');

// 1. Seed Database with full test scenarios
seedDatabase({ withClaims: true });

// Test 1: Database has institutions and seat matrices
const instCount = db.prepare('SELECT COUNT(*) as count FROM institutions').get().count;
assert.ok(instCount >= 3, 'Should have at least 3 institutions seeded');
console.log('✅ Test 1 Passed: Institutions and Seat Matrix properly initialized');

// Test 2: Layer 1 APAAR Verification (Genuine vs Ghost)
const genuineVerification = VerificationEngine.runPipeline('claim_ananya');
assert.strictEqual(genuineVerification.layers.l1.passed, true, 'Genuine student Ananya should pass Layer 1 APAAR check');

const ghostVerification = VerificationEngine.runPipeline('claim_ghost');
assert.strictEqual(ghostVerification.layers.l1.passed, false, 'Ghost student should fail Layer 1 APAAR check');
assert.ok(ghostVerification.riskAnalysis.riskScore >= 50, 'Ghost student should have high risk score');
console.log('✅ Test 2 Passed: Layer 1 APAAR Identity Verification & Ghost Detection verified');

// Test 3: Layer 4 Cross-Institutional Duplicate Detection
const duplicateVerification = VerificationEngine.runPipeline('claim_vikram_abc');
assert.strictEqual(duplicateVerification.layers.l4.clear, false, 'Vikramaditya enrolled in two colleges should fail Layer 4 duplicate check');
assert.ok(duplicateVerification.layers.l4.conflictingClaimId !== null, 'Should capture conflicting claim ID');
console.log('✅ Test 3 Passed: Layer 4 Cross-Institutional Duplicate Enrolment caught');

// Test 4: Seat Ledger & AICTE APH Regulatory Rules
const ledger = SeatLedgerEngine.auditInstitutionIntake('inst_abc', 'B.Tech', 'Computer Science and Engineering', '2026-27');
const nriViolation = ledger.violations.find(v => v.category === 'NRI');
assert.ok(nriViolation, 'Should detect NRI intake excess violation');
assert.strictEqual(nriViolation.excess, 2, 'Should detect 11 enrolled vs 9 approved (excess = 2)');
assert.ok(nriViolation.rule.includes('Section 4.3.2'), 'Should cite AICTE APH Section 4.3.2');
console.log('✅ Test 4 Passed: Seat Ledger properly flagged NRI 15% quota violation with statutory citation');

// Test 5: Independent Student Confirmation & Dispute Freeze
const rohanClaim = db.prepare("SELECT * FROM enrolment_claims WHERE id = 'claim_rohan_abc'").get();
assert.strictEqual(rohanClaim.status, 'DISPUTED', 'Rohan Sharma claim should be frozen under DISPUTED status');
assert.ok(rohanClaim.risk_score >= 80, 'Disputed claim should have escalated risk score');
console.log('✅ Test 5 Passed: Independent Student Confirmation freeze on dispute verified');

// Test 6: W3C Verifiable Credential Issuance & Ed25519 Cryptographic Verification
const issued = CredentialService.issueCredential('claim_ananya');
assert.ok(issued.verificationCode.startsWith('VP-'), 'Verification code format should start with VP-');
assert.ok(issued.verifiableCredential.proof.jws, 'Should include cryptographic signature');

const verified = CredentialService.verifyCredential(issued.verificationCode);
assert.strictEqual(verified.valid, true, 'Cryptographic Ed25519 signature verification should succeed');
assert.strictEqual(verified.studentName, 'Ananya Verma');
assert.strictEqual(verified.signatureAlgorithm, 'Ed25519');
console.log('✅ Test 6 Passed: W3C Verifiable Credential minted and cryptographically validated via Ed25519');

// Test 7: Layer 4 Check 2 — Cross-Institutional Name + DOB Duplicate Detection
const fuzzyClaimId = 'claim_fuzzy_test';
db.prepare(`
  INSERT OR REPLACE INTO enrolment_claims 
  (id, claim_id, institution_id, apaar_id, student_name, date_of_birth, gender, programme, branch, academic_year, seat_type, admission_category, allotment_authority, allotment_reference, fee_payment_reference, status, submission_hash)
  VALUES (?, 'VP-FUZZY-01', 'inst_delhi', NULL, 'Ananya Verma', '2004-08-22', 'Female', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'Regular', 'Open', 'State CET', 'REF-99', 'TXN99', 'SUBMITTED', 'hash123')
`).run(fuzzyClaimId);
const fuzzyResult = VerificationEngine.runPipeline(fuzzyClaimId);
assert.strictEqual(fuzzyResult.layers.l4.clear, false, 'Non-APAAR record with identical Name + DOB in another college must be caught by Check 2');
console.log('✅ Test 7 Passed: Layer 4 Check 2 (Name + DOB cross-college match) successfully caught spoofed duplicate');

// Test 8: AI/ML Anomaly Detection Engine (Section 5.5 & 7)
const anomalyResult = RiskScoringEngine.detectInstitutionAnomaly({
  institutionId: 'inst_rogue',
  institutionName: 'Rogue Institute of Technology',
  intakeUtilizationPct: 135, // Over-admitting
  nriPct: 22, // Exceeds 15% statutory cap
  disputeRate: 0.12, // High dispute rate
  duplicateRate: 0.08,
  avgVerificationPassRate: 0.60
});
assert.strictEqual(anomalyResult.isAnomaly, true, 'Rogue institution with over-admission and disputes must be flagged as anomaly');
assert.ok(anomalyResult.anomalyScore >= 70, 'Anomaly score should be CRITICAL (>= 70)');
assert.ok(anomalyResult.factors.length >= 3, 'Must provide explainable factor attribution');
console.log('✅ Test 8 Passed: AI/ML Institutional Anomaly Engine accurately flagged rogue pattern with explainable factors');

// Test 9: Selective Disclosure Credential Sharing (Section 8.3 & 12)
const presentation = CredentialService.createSelectivePresentation(issued.verificationCode, [
  'studentName', 'institution', 'programme'
]);
assert.ok(presentation.presentationId.startsWith('VP-SHARE-'), 'Presentation ID should start with VP-SHARE-');
assert.strictEqual(presentation.fields.studentName, 'Ananya Verma');
assert.strictEqual(presentation.fields.dateOfBirth, undefined, 'DOB must be hidden when omitted from disclosed fields');
assert.strictEqual(presentation.fields.apaarId, undefined, 'APAAR ID must be hidden when omitted from disclosed fields');
assert.ok(presentation.presentationProof.jws, 'Presentation must have an Ed25519 digital signature');
console.log('✅ Test 9 Passed: Privacy-Preserving Selective Disclosure Presentation successfully verified with Ed25519 proof');

console.log('\n🎉 ALL 9 CORE PROTOTYPE & REGULATORY TESTS PASSED FLAWLESSLY!\n');

// Clean up after tests so dev database remains pristine (0 claims)
clearAllClaims();
