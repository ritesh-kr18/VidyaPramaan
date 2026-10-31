// server/database.js
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbFile = path.join(__dirname, '..', 'vidyapramaan.db');
const db = new DatabaseSync(dbFile);

function initSchema() {
  db.exec(`
    -- 1. Institutions Table
    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      aicte_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      district TEXT NOT NULL,
      institution_type TEXT NOT NULL,
      compliance_score REAL DEFAULT 95.0,
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Seat Matrix Table (Approved Intake by AICTE)
    CREATE TABLE IF NOT EXISTS seat_matrix (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      programme TEXT NOT NULL,
      branch TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      seat_category TEXT NOT NULL, -- Regular, Supernumerary_EWS, NRI, FN
      approved_intake INTEGER NOT NULL,
      aph_reference TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    );

    -- 3. Students Master Registry (APAAR / Central Learner Mock)
    CREATE TABLE IF NOT EXISTS students_master (
      apaar_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      phone_registered TEXT NOT NULL, -- APAAR/Aadhaar linked phone
      email_registered TEXT NOT NULL, -- APAAR/Aadhaar linked email
      aadhaar_ref_hash TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE'
    );

    -- 4. Central Allotment Registry (JoSAA / State CET Mock)
    CREATE TABLE IF NOT EXISTS allotment_registry (
      allotment_id TEXT PRIMARY KEY,
      apaar_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      allotted_institution_id TEXT NOT NULL,
      programme TEXT NOT NULL,
      branch TEXT NOT NULL,
      allotment_quota TEXT NOT NULL,
      seat_category TEXT NOT NULL,
      allotment_authority TEXT NOT NULL, -- JoSAA / State CET / Management
      academic_year TEXT NOT NULL,
      is_seat_accepted INTEGER DEFAULT 1
    );

    -- 5. Enrolment Claims Table (Treating institution submissions as Claims)
    CREATE TABLE IF NOT EXISTS enrolment_claims (
      id TEXT PRIMARY KEY,
      claim_id TEXT UNIQUE NOT NULL,
      institution_id TEXT NOT NULL,
      apaar_id TEXT,
      student_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL,
      programme TEXT NOT NULL,
      branch TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      seat_type TEXT NOT NULL, -- Regular, Supernumerary_EWS, NRI, FN
      admission_category TEXT NOT NULL, -- Open, OBC-NCL, SC, ST, EWS
      allotment_authority TEXT NOT NULL,
      allotment_reference TEXT,
      fee_payment_reference TEXT NOT NULL,
      status TEXT NOT NULL, -- SUBMITTED, UNDER_VERIFICATION, VERIFIED, FLAGGED, DISPUTED, UNDER_INVESTIGATION, COUNTERSIGNED, REJECTED
      risk_score INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'LOW',
      submission_hash TEXT NOT NULL,
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    );

    -- 6. Verification Results Table (5-Layer Pipeline Logs)
    CREATE TABLE IF NOT EXISTS verification_results (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      l1_identity_passed INTEGER DEFAULT 0,
      l1_identity_detail TEXT,
      l2_admission_passed INTEGER DEFAULT 0,
      l2_admission_detail TEXT,
      l3_joining_passed INTEGER DEFAULT 0,
      l3_joining_detail TEXT,
      l4_duplicate_clear INTEGER DEFAULT 1,
      l4_duplicate_detail TEXT,
      conflicting_claim_id TEXT,
      l5_data_integrity_passed INTEGER DEFAULT 0,
      l5_data_integrity_detail TEXT,
      composite_score INTEGER DEFAULT 0,
      overall_status TEXT NOT NULL,
      verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(claim_id) REFERENCES enrolment_claims(id)
    );

    -- 7. Student Independent Confirmations Table
    CREATE TABLE IF NOT EXISTS student_confirmations (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      apaar_id TEXT,
      response TEXT DEFAULT 'PENDING', -- PENDING, CONFIRMED, DISPUTED, CORRECTED
      dispute_reason TEXT,
      corrections_json TEXT,
      contact_channel TEXT NOT NULL,
      contact_independent INTEGER DEFAULT 1, -- 1 = via APAAR linked contact, 0 = via college contact
      notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      responded_at TEXT,
      token TEXT UNIQUE NOT NULL,
      FOREIGN KEY(claim_id) REFERENCES enrolment_claims(id)
    );

    -- 8. Intake Violations Table (Seat Ledger Regulatory Violations)
    CREATE TABLE IF NOT EXISTS intake_violations (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      programme TEXT NOT NULL,
      branch TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      category TEXT NOT NULL,
      approved_intake INTEGER NOT NULL,
      actual_enrolled INTEGER NOT NULL,
      excess_count INTEGER NOT NULL,
      regulatory_rule TEXT NOT NULL,
      severity TEXT NOT NULL, -- MEDIUM, HIGH, CRITICAL
      status TEXT DEFAULT 'OPEN', -- OPEN, UNDER_REVIEW, PENALTY_APPLIED, RESOLVED
      detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    );

    -- 9. W3C Verifiable Credentials Table
    CREATE TABLE IF NOT EXISTS verifiable_credentials (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      apaar_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      programme TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      vc_json TEXT NOT NULL,
      digital_signature TEXT NOT NULL,
      issuer_did TEXT NOT NULL,
      verification_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'COUNTERSIGNED',
      issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(claim_id) REFERENCES enrolment_claims(id)
    );

    -- 10. Immutable Audit Trail Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      claim_id TEXT,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      role TEXT NOT NULL,
      previous_state TEXT,
      new_state TEXT,
      reason TEXT,
      ip_address TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

initSchema();

module.exports = {
  db,
  initSchema
};
