// server/seedData.js
const { db } = require('./database');
const crypto = require('node:crypto');
const SeatLedgerEngine = require('./seatLedgerEngine');
const VerificationEngine = require('./verificationEngine');

function seedDatabase() {
  console.log('🌱 Seeding VidyaPramaan database with realistic AICTE ecosystem data...');

  // 1. Seed Institutions
  const insertInst = db.prepare(`
    INSERT OR REPLACE INTO institutions 
    (id, aicte_id, name, state, district, institution_type, compliance_score, contact_email, contact_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertInst.run(
    'inst_abc',
    '1-1029384751',
    'ABC Institute of Technology',
    'Maharashtra',
    'Pune',
    'Engineering & Technology',
    82.5,
    'principal@abctech.edu.in',
    '+91-20-25678901'
  );

  insertInst.run(
    'inst_nitk',
    '1-3094857263',
    'National Institute of Technology Karnataka (NITK)',
    'Karnataka',
    'Surathkal',
    'National Institute',
    99.2,
    'admissions@nitk.edu.in',
    '+91-824-2474000'
  );

  insertInst.run(
    'inst_delhi',
    '1-2093847562',
    'Delhi College of Engineering & Research',
    'Delhi',
    'New Delhi',
    'Engineering & Technology',
    88.0,
    'dean.admissions@dcer.ac.in',
    '+91-11-27891234'
  );

  // 2. Seed Seat Matrices
  const insertSeat = db.prepare(`
    INSERT OR REPLACE INTO seat_matrix 
    (id, institution_id, programme, branch, academic_year, seat_category, approved_intake, aph_reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // ABC Institute Seat Matrix (Computer Science 2026-27)
  insertSeat.run('sm_abc_reg', 'inst_abc', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'Regular', 60, 'APH-2026-27-SEC-3.1');
  insertSeat.run('sm_abc_ews', 'inst_abc', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'Supernumerary_EWS', 6, 'APH-2026-27-SEC-4.2');
  insertSeat.run('sm_abc_nri', 'inst_abc', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'NRI', 9, 'APH-2026-27-SEC-4.3.2');
  insertSeat.run('sm_abc_fn', 'inst_abc', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'FN', 6, 'APH-2026-27-SEC-4.4');

  // NITK Seat Matrix
  insertSeat.run('sm_nitk_reg', 'inst_nitk', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'Regular', 120, 'APH-2026-27-SEC-3.1');
  insertSeat.run('sm_nitk_ews', 'inst_nitk', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'Supernumerary_EWS', 12, 'APH-2026-27-SEC-4.2');

  // Delhi College Seat Matrix
  insertSeat.run('sm_delhi_reg', 'inst_delhi', 'B.Tech', 'Computer Science and Engineering', '2026-27', 'Regular', 60, 'APH-2026-27-SEC-3.1');

  // 3. Seed Students Master (APAAR / Central Repository Mock)
  const insertStudent = db.prepare(`
    INSERT OR REPLACE INTO students_master 
    (apaar_id, name, date_of_birth, gender, guardian_name, phone_registered, email_registered, aadhaar_ref_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStudent.run(
    '910248193820',
    'Rohan Sharma',
    '2004-05-15',
    'Male',
    'Devendra Sharma',
    '+91-9876543210',
    'rohan.sharma2004@gmail.com',
    crypto.createHash('sha256').update('AADHAAR-HASH-ROHAN').digest('hex')
  );

  insertStudent.run(
    '820194827103',
    'Ananya Verma',
    '2004-08-22',
    'Female',
    'Suresh Verma',
    '+91-9876543211',
    'ananya.v@gmail.com',
    crypto.createHash('sha256').update('AADHAAR-HASH-ANANYA').digest('hex')
  );

  insertStudent.run(
    '730284719284',
    'Vikramaditya Rao',
    '2003-12-10',
    'Male',
    'K. R. Rao',
    '+91-9876543212',
    'vikram.rao@outlook.com',
    crypto.createHash('sha256').update('AADHAAR-HASH-VIKRAM').digest('hex')
  );

  insertStudent.run(
    '640192837465',
    'Priya Patel',
    '2004-03-30',
    'Female',
    'Mukesh Patel',
    '+91-9876543213',
    'priya.patel@gmail.com',
    crypto.createHash('sha256').update('AADHAAR-HASH-PRIYA').digest('hex')
  );

  // 4. Seed Allotment Registry (JoSAA & State CET)
  const insertAllotment = db.prepare(`
    INSERT OR REPLACE INTO allotment_registry 
    (allotment_id, apaar_id, student_name, allotted_institution_id, programme, branch, allotment_quota, seat_category, allotment_authority, academic_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAllotment.run(
    'JOSAA-2026-NITK-4110',
    '910248193820',
    'Rohan Sharma',
    'inst_nitk',
    'B.Tech',
    'Computer Science and Engineering',
    'OPEN',
    'Regular',
    'JoSAA (Central)',
    '2026-27'
  );

  insertAllotment.run(
    'MHT-CET-2026-ABC-01',
    '820194827103',
    'Ananya Verma',
    'inst_abc',
    'B.Tech',
    'Computer Science and Engineering',
    'OBC-NCL',
    'Regular',
    'State CET Cell (Maharashtra)',
    '2026-27'
  );

  insertAllotment.run(
    'MHT-CET-2026-ABC-02',
    '640192837465',
    'Priya Patel',
    'inst_abc',
    'B.Tech',
    'Computer Science and Engineering',
    'OPEN',
    'Regular',
    'State CET Cell (Maharashtra)',
    '2026-27'
  );

  // 5. Seed Pre-Staged Enrolment Claims (Representing Demo Scenarios)
  const insertClaim = db.prepare(`
    INSERT OR REPLACE INTO enrolment_claims 
    (id, claim_id, institution_id, apaar_id, student_name, date_of_birth, gender, programme, branch, academic_year, seat_type, admission_category, allotment_authority, allotment_reference, fee_payment_reference, status, submission_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // SCENARIO 1: Genuine Student (Ananya Verma @ ABC Tech)
  insertClaim.run(
    'claim_ananya',
    'VP-2026-000101',
    'inst_abc',
    '820194827103',
    'Ananya Verma',
    '2004-08-22',
    'Female',
    'B.Tech',
    'Computer Science and Engineering',
    '2026-27',
    'Regular',
    'OBC-NCL',
    'State CET Cell (Maharashtra)',
    'MHT-CET-2026-ABC-01',
    'TXN8392019281',
    'SUBMITTED',
    crypto.createHash('sha256').update('ananya-claim').digest('hex')
  );

  // SCENARIO 2: Ghost Student / Invalid APAAR (Aarav Gupta @ ABC Tech)
  insertClaim.run(
    'claim_ghost',
    'VP-2026-000102',
    'inst_abc',
    '999999999999', // Non-existent APAAR
    'Aarav Gupta',
    '2004-01-01',
    'Male',
    'B.Tech',
    'Computer Science and Engineering',
    '2026-27',
    'Regular',
    'Open',
    'Management Quota',
    'UNVERIFIED-MGMT-99',
    'TXN1112223334',
    'SUBMITTED',
    crypto.createHash('sha256').update('ghost-claim').digest('hex')
  );

  // SCENARIO 3: Cross-Institutional Duplicate (Vikramaditya Rao enrolled in Delhi College AND ABC Tech)
  insertClaim.run(
    'claim_vikram_delhi',
    'VP-2026-000201',
    'inst_delhi',
    '730284719284',
    'Vikramaditya Rao',
    '2003-12-10',
    'Male',
    'B.Tech',
    'Computer Science and Engineering',
    '2026-27',
    'Regular',
    'Open',
    'Institutional Admission',
    'DELHI-ADM-7302',
    'TXN7391028471',
    'SUBMITTED',
    crypto.createHash('sha256').update('vikram-delhi').digest('hex')
  );

  insertClaim.run(
    'claim_vikram_abc',
    'VP-2026-000103',
    'inst_abc',
    '730284719284',
    'Vikramaditya Rao',
    '2003-12-10',
    'Male',
    'B.Tech',
    'Computer Science and Engineering',
    '2026-27',
    'Regular',
    'Open',
    'Institutional Admission',
    'ABC-MGMT-7302',
    'TXN7391028472',
    'SUBMITTED',
    crypto.createHash('sha256').update('vikram-abc').digest('hex')
  );

  // SCENARIO 4: Disputed Enrolment Claim (Rohan Sharma falsely claimed by ABC Tech)
  insertClaim.run(
    'claim_rohan_abc',
    'VP-2026-000104',
    'inst_abc',
    '910248193820', // Rohan's genuine APAAR
    'Rohan Sharma',
    '2004-05-15',
    'Male',
    'B.Tech',
    'Computer Science and Engineering',
    '2026-27',
    'Regular',
    'Open',
    'Direct Admission',
    'ABC-PROXY-9102',
    'TXN9948192031',
    'SUBMITTED',
    crypto.createHash('sha256').update('rohan-abc-claim').digest('hex')
  );

  // Also seed Rohan's real claim at NITK
  insertClaim.run(
    'claim_rohan_nitk',
    'VP-2026-000301',
    'inst_nitk',
    '910248193820',
    'Rohan Sharma',
    '2004-05-15',
    'Male',
    'B.Tech',
    'Computer Science and Engineering',
    '2026-27',
    'Regular',
    'OPEN',
    'JoSAA (Central)',
    'JOSAA-2026-NITK-4110',
    'TXN9481920491',
    'SUBMITTED',
    crypto.createHash('sha256').update('rohan-nitk-claim').digest('hex')
  );

  // SCENARIO 5: NRI Category Over-Admissions (Seed 11 NRI claims where approved intake is only 9)
  for (let i = 1; i <= 11; i++) {
    const nriApaar = `9800000000${i.toString().padStart(2, '0')}`;
    const nriName = `NRI Candidate ${i}`;
    
    // Insert into master
    insertStudent.run(
      nriApaar,
      nriName,
      '2004-06-15',
      'Male',
      'Guardian ' + i,
      `+91-98700000${i.toString().padStart(2, '0')}`,
      `nri.${i}@gmail.com`,
      crypto.createHash('sha256').update(`NRI-${i}`).digest('hex')
    );

    insertClaim.run(
      `claim_nri_${i}`,
      `VP-2026-NRI${i.toString().padStart(3, '0')}`,
      'inst_abc',
      nriApaar,
      nriName,
      '2004-06-15',
      'Male',
      'B.Tech',
      'Computer Science and Engineering',
      '2026-27',
      'NRI',
      'NRI Quota',
      'NRI Committee',
      `NRI-ALLOT-${i}`,
      `TXN_NRI_${i}`,
      'SUBMITTED',
      crypto.createHash('sha256').update(`nri-${i}`).digest('hex')
    );
  }

  console.log('⚡ Running verification pipeline on initial pre-staged claims...');
  const claims = db.prepare(`SELECT id FROM enrolment_claims`).all();
  claims.forEach(c => {
    try {
      VerificationEngine.runPipeline(c.id);
    } catch (e) {
      console.error(`Error verifying claim ${c.id}:`, e.message);
    }
  });

  // Pre-set Rohan's dispute on ABC claim to demonstrate independent confirmation immediately
  const rohanConf = db.prepare(`SELECT id FROM student_confirmations WHERE claim_id = 'claim_rohan_abc'`).get();
  if (rohanConf) {
    db.prepare(`
      UPDATE student_confirmations 
      SET response = 'DISPUTED', 
          dispute_reason = 'I never applied or took admission at ABC Tech. I accepted and joined NIT Surathkal through JoSAA Round 3.',
          responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rohanConf.id);

    // Re-run pipeline for Rohan's ABC claim to apply dispute lock
    VerificationEngine.runPipeline('claim_rohan_abc');
  }

  // Pre-confirm Ananya's claim to show countersigned flow
  const ananyaConf = db.prepare(`SELECT id FROM student_confirmations WHERE claim_id = 'claim_ananya'`).get();
  if (ananyaConf) {
    db.prepare(`
      UPDATE student_confirmations 
      SET response = 'CONFIRMED', 
          responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ananyaConf.id);
    VerificationEngine.runPipeline('claim_ananya');
  }

  console.log('✅ Database seeded and pipeline executed successfully!');
}

module.exports = { seedDatabase };
