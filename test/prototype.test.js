// test/prototype.test.js
const assert = require('node:assert');
const { db } = require('../server/database');
const { seedDatabase } = require('../server/seedData');
const VerificationEngine = require('../server/verificationEngine');
const SeatLedgerEngine = require('../server/seatLedgerEngine');
const RiskScoringEngine = require('../server/riskScoringEngine');
const CredentialService = require('../server/credentialService');

console.log('🧪 Starting VidyaPramaan Automated Prototype Verification Suite...\n');

// 1. Seed Database
seedDatabase();

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

console.log('\n🎉 ALL 6 CORE PROTOTYPE TESTS PASSED FLAWLESSLY!\n');
