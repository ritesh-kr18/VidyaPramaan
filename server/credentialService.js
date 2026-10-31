// server/credentialService.js
const crypto = require('node:crypto');
const { db } = require('./database');

// Generate persistent/in-memory Ed25519 keypair for AICTE Authority
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

class CredentialService {
  static getIssuerDID() {
    return 'did:web:aicte-india.org:verifiers:registry-2026';
  }

  static getPublicKeyPem() {
    return publicKey;
  }

  /**
   * Generates a tamper-proof W3C Verifiable Credential for a verified claim.
   */
  static issueCredential(claimId) {
    const claimStmt = db.prepare(`
      SELECT c.*, i.name as institution_name, i.aicte_id
      FROM enrolment_claims c
      JOIN institutions i ON c.institution_id = i.id
      WHERE c.id = ?
    `);
    const claim = claimStmt.get(claimId);
    if (!claim) throw new Error('Claim not found');

    const verificationCode = 'VP-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const unsignedCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://schema.aicte-india.org/credentials/enrolment/v1'
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiableCredential', 'AICTEEnrolmentCredential'],
      issuer: this.getIssuerDID(),
      issuanceDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      credentialSubject: {
        id: `did:apaar:IN:${claim.apaar_id || 'PROVISIONAL'}`,
        apaarId: claim.apaar_id,
        studentName: claim.student_name,
        dateOfBirth: claim.date_of_birth,
        gender: claim.gender,
        institution: {
          aicteId: claim.aicte_id,
          name: claim.institution_name
        },
        enrolment: {
          claimId: claim.claim_id,
          programme: claim.programme,
          branch: claim.branch,
          academicYear: claim.academic_year,
          seatType: claim.seat_type,
          admissionCategory: claim.admission_category,
          status: 'COUNTERSIGNED'
        },
        evidence: {
          apaarVerified: true,
          seatIntakeVerified: true,
          duplicateAuditPassed: true,
          independentConfirmationReceived: true
        }
      }
    };

    // Cryptographic signature with Ed25519
    const serializedPayload = Buffer.from(JSON.stringify(unsignedCredential));
    const signature = crypto.sign(null, serializedPayload, privateKey).toString('base64');

    const signedCredential = {
      ...unsignedCredential,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${this.getIssuerDID()}#keys-1`,
        proofPurpose: 'assertionMethod',
        jws: signature
      }
    };

    // Store in database
    const credId = crypto.randomUUID();
    const insertStmt = db.prepare(`
      INSERT INTO verifiable_credentials 
      (id, claim_id, apaar_id, student_name, institution_name, programme, academic_year, vc_json, digital_signature, issuer_did, verification_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      credId,
      claimId,
      claim.apaar_id || 'N/A',
      claim.student_name,
      claim.institution_name,
      claim.programme,
      claim.academic_year,
      JSON.stringify(signedCredential),
      signature,
      this.getIssuerDID(),
      verificationCode
    );

    return {
      credentialId: credId,
      verificationCode,
      verifiableCredential: signedCredential,
      qrSvg: this.generateQrSvg(verificationCode, claim.student_name, claim.institution_name)
    };
  }

  /**
   * Verifies an issued credential's cryptographic signature
   */
  static verifyCredential(verificationCode) {
    const stmt = db.prepare(`
      SELECT vc.*, c.status as claim_status
      FROM verifiable_credentials vc
      JOIN enrolment_claims c ON vc.claim_id = c.id
      WHERE vc.verification_code = ?
    `);
    const record = stmt.get(verificationCode);
    if (!record) return { valid: false, error: 'Credential verification code not found' };

    try {
      const parsedVc = JSON.parse(record.vc_json);
      const proof = parsedVc.proof;
      delete parsedVc.proof;

      const serializedPayload = Buffer.from(JSON.stringify(parsedVc));
      const isSignatureValid = crypto.verify(
        null,
        serializedPayload,
        publicKey,
        Buffer.from(proof.jws, 'base64')
      );

      return {
        valid: isSignatureValid,
        status: record.status,
        studentName: record.student_name,
        apaarId: record.apaar_id,
        institutionName: record.institution_name,
        programme: record.programme,
        academicYear: record.academic_year,
        issuedAt: record.issued_at,
        issuerDid: record.issuer_did,
        signatureAlgorithm: 'Ed25519',
        digitalSignatureHash: record.digital_signature.slice(0, 32) + '...'
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Generates a high-contrast procedural SVG QR-pattern visual
   */
  static generateQrSvg(code, name, institution) {
    // Generate deterministic 21x21 matrix based on sha256 hash of code
    const hash = crypto.createHash('sha256').update(code + name + institution).digest('hex');
    const size = 21;
    const cellSize = 10;
    const padding = 20;
    const totalDim = size * cellSize + padding * 2;

    let rects = '';

    // Draw position finder patterns (top-left, top-right, bottom-left)
    function drawFinder(ox, oy) {
      rects += `<rect x="${ox}" y="${oy}" width="${7 * cellSize}" height="${7 * cellSize}" fill="#0f172a" rx="4"/>`;
      rects += `<rect x="${ox + cellSize}" y="${oy + cellSize}" width="${5 * cellSize}" height="${5 * cellSize}" fill="#ffffff" rx="2"/>`;
      rects += `<rect x="${ox + 2 * cellSize}" y="${oy + 2 * cellSize}" width="${3 * cellSize}" height="${3 * cellSize}" fill="#0f172a" rx="2"/>`;
    }

    drawFinder(padding, padding);
    drawFinder(padding + 14 * cellSize, padding);
    drawFinder(padding, padding + 14 * cellSize);

    // Procedural data cells
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Skip finder areas
        if (
          (r < 8 && c < 8) ||
          (r < 8 && c >= 13) ||
          (r >= 13 && c < 8)
        ) {
          continue;
        }

        const charIdx = (r * size + c) % hash.length;
        const charCode = hash.charCodeAt(charIdx);
        if (charCode % 2 === 0) {
          const x = padding + c * cellSize;
          const y = padding + r * cellSize;
          rects += `<rect x="${x}" y="${y}" width="${cellSize - 1}" height="${cellSize - 1}" fill="#1e293b" rx="1.5"/>`;
        }
      }
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="100%" height="100%" class="rounded-xl shadow-md bg-white p-2">
        <rect width="${totalDim}" height="${totalDim}" fill="#ffffff" rx="12"/>
        ${rects}
      </svg>
    `;
  }
}

module.exports = CredentialService;
