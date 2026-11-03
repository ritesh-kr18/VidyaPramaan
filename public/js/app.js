// public/js/app.js

let currentPortal = 'aicte';
let currentAicteTab = 'queue';
let selectedInstitutionId = 'inst_abc';
let selectedStudentApaar = '910248193820';
let activeCaseClaimId = null;

// Clock
function updateClock() {
  const el = document.getElementById('currentTime');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN');
  }
}
setInterval(updateClock, 1000);
updateClock();

// ==========================================
// PORTAL SWITCHING
// ==========================================
function switchPortal(portal) {
  currentPortal = portal;
  document.querySelectorAll('.portal-view').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.portal-tab').forEach(el => {
    el.classList.remove('bg-white', 'text-blue-900', 'shadow-xs', 'border-slate-300');
    el.classList.add('text-slate-600');
  });

  const activeView = document.getElementById(`view-${portal}`);
  const activeTab = document.getElementById(`tab-${portal}`);
  if (activeView) activeView.classList.remove('hidden');
  if (activeTab) {
    activeTab.classList.add('bg-white', 'text-blue-900', 'shadow-xs', 'border-slate-300');
    activeTab.classList.remove('text-slate-600');
  }

  if (portal === 'aicte') {
    loadAicteData();
  } else if (portal === 'institution') {
    loadInstitutionsList();
  } else if (portal === 'student') {
    loadStudentData();
  } else if (portal === 'verifier') {
    loadQuickVerifySamples();
  }
}

// ==========================================
// AICTE SUB-TABS
// ==========================================
function switchAicteTab(tab) {
  currentAicteTab = tab;
  ['queue', 'ledger', 'audit'].forEach(t => {
    const el = document.getElementById(`aicte-subview-${t}`);
    const btn = document.getElementById(`atab-${t}`);
    if (el) el.classList.add('hidden');
    if (btn) {
      btn.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600');
      btn.classList.add('text-slate-500');
    }
  });

  const activeSub = document.getElementById(`aicte-subview-${tab}`);
  const activeBtn = document.getElementById(`atab-${tab}`);
  if (activeSub) activeSub.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600');
    activeBtn.classList.remove('text-slate-500');
  }

  if (tab === 'ledger') loadNationalLedger();
  if (tab === 'audit') loadAuditLogs();
}

// ==========================================
// 1. AICTE CENTRAL COMMAND CONTROLLER
// ==========================================
async function loadAicteData() {
  try {
    // 1. Load KPIs
    const kpiRes = await fetch('/api/aicte/national-kpis');
    const { kpis } = await kpiRes.json();

    const kpiContainer = document.getElementById('aicte-kpi-container');
    kpiContainer.innerHTML = `
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">Institutions</div>
        <div class="text-xl font-extrabold text-slate-900 mt-1">${kpis.totalInstitutions}</div>
        <div class="text-[10px] text-emerald-600 mt-0.5">Approved & Integrated</div>
      </div>
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">Enrolment Claims</div>
        <div class="text-xl font-extrabold text-indigo-600 mt-1">${kpis.totalClaims}</div>
        <div class="text-[10px] text-slate-500 mt-0.5">Across All Programs</div>
      </div>
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">Verified Rate</div>
        <div class="text-xl font-extrabold text-emerald-600 mt-1">${kpis.verificationRate}%</div>
        <div class="text-[10px] text-slate-500 mt-0.5">${kpis.verifiedClaims} claims verified</div>
      </div>
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">Student Disputes</div>
        <div class="text-xl font-extrabold text-red-600 mt-1">${kpis.disputedClaims}</div>
        <div class="text-[10px] text-red-500 mt-0.5 font-medium">Immediate Freeze Locked</div>
      </div>
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">Duplicates Caught</div>
        <div class="text-xl font-extrabold text-amber-600 mt-1">${kpis.duplicateAlerts}</div>
        <div class="text-[10px] text-amber-600 mt-0.5">Cross-Institute Matches</div>
      </div>
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">Intake Violations</div>
        <div class="text-xl font-extrabold text-purple-600 mt-1">${kpis.activeViolations}</div>
        <div class="text-[10px] text-purple-600 mt-0.5">APH Rule Breaches</div>
      </div>
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-[11px] font-semibold text-slate-500 uppercase">W3C VCs Issued</div>
        <div class="text-xl font-extrabold text-teal-600 mt-1">${kpis.credentialsIssued}</div>
        <div class="text-[10px] text-teal-600 mt-0.5">Ed25519 Signed QR</div>
      </div>
    `;

    // 2. Load Priority Risk Queue
    const qRes = await fetch('/api/aicte/risk-queue');
    const { count, queue } = await qRes.json();

    document.getElementById('queue-badge').textContent = count;

    const listEl = document.getElementById('riskQueueList');
    if (queue.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-xs text-slate-400">
          <i class="fa-solid fa-inbox text-3xl mb-2 text-slate-300 block"></i>
          <span class="font-semibold text-slate-600 block text-xs">Priority Risk Queue Empty</span>
          <span class="text-[11px] text-slate-400 mt-1 block">No enrolment claims or anomalies in queue.<br>Switch to the <strong>Institution Portal</strong> to upload student enrolment claims.</span>
        </div>`;
      const panel = document.getElementById('caseReviewPanel');
      if (panel) {
        panel.innerHTML = `
          <div class="flex items-center justify-center h-full text-slate-400 flex-col space-y-3 p-8 text-center">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
              <i class="fa-regular fa-folder-open text-2xl"></i>
            </div>
            <h4 class="font-bold text-slate-700 text-sm">Case Evidence Dossier Inactive</h4>
            <p class="text-xs text-slate-500 max-w-sm">No active claims are under review. Go to the <strong>Institution Portal</strong> to upload student enrolment data, or select an inspection case above.</p>
          </div>
        `;
      }
    } else {
      listEl.innerHTML = queue.map(c => {
        let badgeColor = 'bg-slate-100 text-slate-700';
        if (c.risk_level === 'CRITICAL') badgeColor = 'bg-red-100 text-red-800 border-red-200';
        else if (c.risk_level === 'HIGH') badgeColor = 'bg-orange-100 text-orange-800 border-orange-200';
        else if (c.risk_level === 'MEDIUM') badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';

        const isDisputed = c.status === 'DISPUTED';
        const isDuplicate = c.l4_duplicate_clear === 0;

        return `
          <div onclick="inspectCase('${c.id}')" class="p-3 rounded-xl border cursor-pointer transition hover:border-indigo-500 hover:shadow-sm ${activeCaseClaimId === c.id ? 'border-indigo-600 bg-indigo-50/40' : 'border-slate-200 bg-white'}">
            <div class="flex justify-between items-start">
              <div>
                <span class="font-mono text-[10px] text-slate-500">${c.claim_id}</span>
                <h5 class="font-bold text-xs text-slate-900">${c.student_name}</h5>
              </div>
              <div class="flex items-center space-x-1.5">
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badgeColor}">
                  Risk ${c.risk_score} · ${c.risk_level}
                </span>
              </div>
            </div>

            <div class="text-[11px] text-slate-600 mt-1">
              <span class="font-medium">${c.institution_name}</span>
            </div>

            <div class="flex flex-wrap gap-1 mt-2">
              ${isDisputed ? `<span class="text-[9px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i> Student Disputed</span>` : ''}
              ${isDuplicate ? `<span class="text-[9px] bg-orange-600 text-white font-bold px-1.5 py-0.5 rounded"><i class="fa-solid fa-clone mr-0.5"></i> Duplicate Match</span>` : ''}
              ${c.l1_identity_passed === 0 ? `<span class="text-[9px] bg-slate-800 text-slate-100 font-semibold px-1.5 py-0.5 rounded">APAAR Mismatch</span>` : ''}
              ${c.seat_type === 'NRI' ? `<span class="text-[9px] bg-yellow-100 text-yellow-800 font-semibold px-1.5 py-0.5 rounded">NRI Quota</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Auto-select first item if none active
      if (!activeCaseClaimId && queue.length > 0) {
        inspectCase(queue[0].id);
      }
    }

  } catch (err) {
    console.error('Error loading AICTE dashboard:', err);
  }
}

// Case Review Studio (Inspector)
async function inspectCase(claimId) {
  activeCaseClaimId = claimId;
  loadAicteData(); // refresh active highlight
  const panel = document.getElementById('caseReviewPanel');
  panel.innerHTML = `<div class="p-8 text-center text-slate-400">Loading case evidence dossier...</div>`;

  try {
    const res = await fetch(`/api/aicte/claims/${claimId}`);
    const { claim, conflictingClaim, history } = await res.json();

    const isCountersigned = claim.status === 'COUNTERSIGNED';
    const isRejected = claim.status === 'REJECTED';

    panel.innerHTML = `
      <div class="space-y-5">
        <!-- Header -->
        <div class="flex justify-between items-start pb-4 border-b border-slate-200">
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-mono text-xs font-bold text-slate-500">${claim.claim_id}</span>
              <span class="text-xs px-2 py-0.5 rounded font-extrabold ${claim.status === 'DISPUTED' ? 'bg-red-100 text-red-800' : (claim.status === 'COUNTERSIGNED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}">
                ${claim.status}
              </span>
            </div>
            <h3 class="font-heading font-extrabold text-lg text-slate-900 mt-1">${claim.student_name}</h3>
            <p class="text-xs text-slate-500">Claimed by <span class="font-semibold text-slate-800">${claim.institution_name}</span> (${claim.programme} - ${claim.branch})</p>
          </div>

          <div class="text-right">
            <div class="text-2xl font-black text-red-600">Risk ${claim.risk_score}<span class="text-xs font-normal text-slate-500">/100</span></div>
            <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500">Anomaly Rating: ${claim.risk_level}</div>
          </div>
        </div>

        <!-- Student Dispute Alert Banner if Disputed -->
        ${claim.student_confirmation === 'DISPUTED' ? `
          <div class="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-1">
            <div class="font-bold text-xs flex items-center space-x-1.5">
              <i class="fa-solid fa-triangle-exclamation text-red-600 text-sm"></i>
              <span>INDEPENDENT STUDENT DISPUTE RECORDED</span>
            </div>
            <p class="text-xs italic bg-white/70 p-2 rounded-lg border border-red-200 text-red-950 font-medium">
              "${claim.dispute_reason || 'Student independently denied taking admission at this institution.'}"
            </p>
            <div class="text-[10px] text-red-700">Channel: Authenticated via APAAR-linked mobile registry. Claim automatically locked.</div>
          </div>
        ` : ''}

        <!-- Cross-Institutional Duplicate Banner if Duplicate -->
        ${claim.l4_duplicate_clear === 0 && conflictingClaim ? `
          <div class="p-3.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-950 space-y-1">
            <div class="font-bold text-xs flex items-center space-x-1.5 text-orange-900">
              <i class="fa-solid fa-clone text-orange-600 text-sm"></i>
              <span>CROSS-INSTITUTIONAL DUPLICATE ENROLMENT CAUGHT</span>
            </div>
            <p class="text-xs">
              Same student APAAR <span class="font-mono font-bold">${claim.apaar_id}</span> is also claimed by:
              <br><strong class="text-slate-900">${conflictingClaim.conflicting_inst_name}</strong> under Claim <span class="font-mono font-bold">${conflictingClaim.claim_id}</span>.
            </p>
            <div class="text-[10px] text-orange-800">Violation: Simultaneous active enrolment claim across two degree-granting institutes.</div>
          </div>
        ` : ''}

        <!-- 5-Layer Evidence Dossier -->
        <div>
          <h4 class="font-heading font-bold text-xs text-slate-900 uppercase tracking-wider mb-2">5-Layer Autonomous Evidence Dossier</h4>
          <div class="space-y-2 text-xs">
            
            <!-- Layer 1 -->
            <div class="p-2.5 rounded-lg border flex items-start space-x-2.5 ${claim.l1_identity_passed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}">
              <span class="mt-0.5 text-sm ${claim.l1_identity_passed ? 'text-emerald-600' : 'text-red-600'}">
                <i class="fa-solid ${claim.l1_identity_passed ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
              </span>
              <div>
                <span class="font-bold text-slate-800">Layer 1: APAAR Identity Check</span>
                <p class="text-[11px] text-slate-600 mt-0.5">${claim.l1_identity_detail || 'Checked'}</p>
              </div>
            </div>

            <!-- Layer 2 -->
            <div class="p-2.5 rounded-lg border flex items-start space-x-2.5 ${claim.l2_admission_passed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'}">
              <span class="mt-0.5 text-sm ${claim.l2_admission_passed ? 'text-emerald-600' : 'text-amber-600'}">
                <i class="fa-solid ${claim.l2_admission_passed ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
              </span>
              <div>
                <span class="font-bold text-slate-800">Layer 2: Admission Evidence (JoSAA / State CET Allotment)</span>
                <p class="text-[11px] text-slate-600 mt-0.5">${claim.l2_admission_detail || 'Checked'}</p>
              </div>
            </div>

            <!-- Layer 3 -->
            <div class="p-2.5 rounded-lg border flex items-start space-x-2.5 ${claim.l3_joining_passed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}">
              <span class="mt-0.5 text-sm ${claim.l3_joining_passed ? 'text-emerald-600' : 'text-red-600'}">
                <i class="fa-solid ${claim.l3_joining_passed ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
              </span>
              <div>
                <span class="font-bold text-slate-800">Layer 3: Joining Evidence & Independent Confirmation</span>
                <p class="text-[11px] text-slate-600 mt-0.5">${claim.l3_joining_detail || 'Checked'}</p>
              </div>
            </div>

            <!-- Layer 4 -->
            <div class="p-2.5 rounded-lg border flex items-start space-x-2.5 ${claim.l4_duplicate_clear ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}">
              <span class="mt-0.5 text-sm ${claim.l4_duplicate_clear ? 'text-emerald-600' : 'text-red-600'}">
                <i class="fa-solid ${claim.l4_duplicate_clear ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
              </span>
              <div>
                <span class="font-bold text-slate-800">Layer 4: Cross-Institutional Deduplication</span>
                <p class="text-[11px] text-slate-600 mt-0.5">${claim.l4_duplicate_detail || 'Checked'}</p>
              </div>
            </div>

            <!-- Layer 5 -->
            <div class="p-2.5 rounded-lg border flex items-start space-x-2.5 ${claim.l5_data_integrity_passed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-yellow-50/60 border-yellow-200'}">
              <span class="mt-0.5 text-sm ${claim.l5_data_integrity_passed ? 'text-emerald-600' : 'text-yellow-600'}">
                <i class="fa-solid ${claim.l5_data_integrity_passed ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
              </span>
              <div>
                <span class="font-bold text-slate-800">Layer 5: Seat Ledger Intake Compliance</span>
                <p class="text-[11px] text-slate-600 mt-0.5">${claim.l5_data_integrity_detail || 'Checked'}</p>
              </div>
            </div>

          </div>
        </div>

        <!-- AICTE Officer Adjudication Studio -->
        <div class="pt-4 border-t border-slate-200 bg-slate-50 p-4 rounded-xl space-y-3">
          <div class="flex justify-between items-center">
            <h4 class="font-heading font-bold text-xs text-slate-900 uppercase tracking-wider">Officer Regulatory Adjudication</h4>
            <span class="text-[10px] text-slate-500 font-mono">Mandatory Human-in-the-Loop</span>
          </div>

          <div class="space-y-2">
            <textarea id="adjudicateReason" placeholder="Enter formal regulatory decision remarks or statutory justification..." class="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white" rows="2"></textarea>
          </div>

          <div class="flex flex-wrap gap-2 pt-1">
            <button onclick="submitAdjudication('${claim.id}', 'COUNTERSIGN')" ${isCountersigned ? 'disabled' : ''} class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center space-x-1 min-w-[130px]">
              <i class="fa-solid fa-stamp"></i>
              <span>${isCountersigned ? 'Countersigned' : 'COUNTERSIGN & MINT VC'}</span>
            </button>
            <button onclick="submitAdjudication('${claim.id}', 'REJECT')" ${isRejected ? 'disabled' : ''} class="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center space-x-1 min-w-[110px]">
              <i class="fa-solid fa-ban"></i>
              <span>${isRejected ? 'Rejected' : 'REJECT'}</span>
            </button>
            <button onclick="requestOfficerInfo('${claim.id}')" class="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1">
              <i class="fa-solid fa-circle-question"></i>
              <span>Request Info</span>
            </button>
            <button onclick="rerunVerification('${claim.id}')" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1" title="Re-execute 5-Layer Verification Engine">
              <i class="fa-solid fa-arrows-rotate"></i>
              <span>Re-run Checks</span>
            </button>
          </div>
        </div>

      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div class="p-8 text-center text-red-500">Error loading claim details: ${err.message}</div>`;
  }
}

// Submit Officer Decision
async function submitAdjudication(claimId, decision) {
  const reason = document.getElementById('adjudicateReason')?.value;
  try {
    const res = await fetch(`/api/aicte/claims/${claimId}/adjudicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Decision recorded! Claim status updated to: ${data.newStatus}`);
      inspectCase(claimId);
      loadAicteData();
    }
  } catch (err) {
    alert('Failed to record adjudication: ' + err.message);
  }
}

// AICTE Officer Request Additional Documentation (Section 9.2)
async function requestOfficerInfo(claimId) {
  const notes = prompt('Enter specific documents or clarification required from the college:', 'Please provide verified state counselling allotment slip and attested fee receipt.');
  if (!notes) return;

  try {
    const res = await fetch(`/api/aicte/claims/${claimId}/request-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, requested_documents: notes })
    });
    const data = await res.json();
    if (data.success) {
      alert('Formal request issued! Claim marked UNDER_INVESTIGATION.');
      inspectCase(claimId);
      loadAicteData();
    }
  } catch (err) {
    alert('Error requesting info: ' + err.message);
  }
}

// Re-run Verification Pipeline on Demand (Section 9.3)
async function rerunVerification(claimId) {
  try {
    const res = await fetch(`/api/verification/${claimId}/rerun`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Pipeline re-executed! Updated Status: ${data.pipelineResult.newStatus}, Risk Score: ${data.pipelineResult.riskAnalysis.riskScore}`);
      inspectCase(claimId);
      loadAicteData();
    }
  } catch (err) {
    alert('Error re-running pipeline: ' + err.message);
  }
}

// Load National Seat Ledger
async function loadNationalLedger() {
  const container = document.getElementById('nationalLedgerContent');
  container.innerHTML = `<div class="p-6 text-center text-slate-400">Loading National Seat Ledger...</div>`;

  try {
    const res = await fetch('/api/aicte/seat-ledger');
    const { totalApproved, totalEnrolled, violations } = await res.json();

    container.innerHTML = `
      <div class="mb-4 grid grid-cols-3 gap-3 text-xs">
        <div class="bg-slate-50 p-3 rounded-lg border">
          <span class="text-slate-500">Total Approved Intake:</span>
          <span class="font-extrabold text-base text-slate-900 ml-2">${totalApproved} seats</span>
        </div>
        <div class="bg-slate-50 p-3 rounded-lg border">
          <span class="text-slate-500">Actual Enrolled (All Claims):</span>
          <span class="font-extrabold text-base text-indigo-600 ml-2">${totalEnrolled} seats</span>
        </div>
        <div class="bg-red-50 p-3 rounded-lg border border-red-200">
          <span class="text-red-700 font-semibold">Active Statutory Violations:</span>
          <span class="font-extrabold text-base text-red-700 ml-2">${violations.length} breaches</span>
        </div>
      </div>

      <h4 class="font-heading font-bold text-xs uppercase tracking-wider text-slate-800 mb-2">Detected APH Statutory Quota Breaches</h4>
      <table class="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
        <thead class="bg-slate-100 text-slate-700 font-bold">
          <tr>
            <th class="p-2.5">Institution</th>
            <th class="p-2.5">Category</th>
            <th class="p-2.5">Approved</th>
            <th class="p-2.5">Actual Enrolled</th>
            <th class="p-2.5">Excess</th>
            <th class="p-2.5">Statutory APH Regulation</th>
            <th class="p-2.5">Severity</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${violations.length === 0 ? `<tr><td colspan="7" class="p-4 text-center text-slate-400">No intake violations active.</td></tr>` : 
            violations.map(v => `
              <tr class="hover:bg-slate-50/80">
                <td class="p-2.5 font-semibold text-slate-900">${v.institution_name} <span class="text-[10px] text-slate-500 block font-mono">${v.aicte_id}</span></td>
                <td class="p-2.5 font-bold text-indigo-700">${v.category}</td>
                <td class="p-2.5">${v.approved_intake}</td>
                <td class="p-2.5 font-extrabold text-red-600">${v.actual_enrolled}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 bg-red-100 text-red-800 font-bold rounded">+${v.excess_count} seats</span></td>
                <td class="p-2.5 text-slate-600 text-[11px] max-w-xs font-mono">${v.regulatory_rule}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${v.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}">${v.severity}</span></td>
              </tr>
            `).join('')
          }
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-center text-red-500">Error loading ledger: ${err.message}</div>`;
  }
}

// Load Audit Trail
async function loadAuditLogs() {
  const listEl = document.getElementById('auditLogList');
  listEl.innerHTML = `<div class="p-6 text-center text-slate-400">Loading audit trail...</div>`;
  try {
    const res = await fetch('/api/aicte/audit-logs');
    const { logs } = await res.json();
    if (!logs || logs.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs">
          <i class="fa-solid fa-fingerprint text-2xl mb-2 text-slate-300 block"></i>
          <span class="font-semibold text-slate-600 block text-xs">Immutable Audit Log Initialized</span>
          <span class="text-[11px] text-slate-400 mt-0.5 block">Cryptographic state transitions will appear here in real-time as enrolment claims are ingested and processed.</span>
        </div>`;
      return;
    }
    listEl.innerHTML = logs.map(l => `
      <div class="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex justify-between items-center hover:bg-slate-50">
        <div>
          <span class="font-mono text-[10px] text-slate-400">${new Date(l.timestamp).toLocaleTimeString()} · ${l.ip_address || 'System'}</span>
          <div class="font-semibold text-slate-900">${l.action} <span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono ml-1">${l.role}</span></div>
          <p class="text-[11px] text-slate-500 mt-0.5">${l.reason || ''}</p>
        </div>
        <div class="text-right text-[11px] text-indigo-600 font-medium">
          ${l.previous_state ? `<span class="text-slate-400">${l.previous_state}</span> ➔ ` : ''} <span class="font-bold">${l.new_state || 'Recorded'}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="p-4 text-center text-red-500">Error: ${err.message}</div>`;
  }
}

// ==========================================
// 2. INSTITUTION PORTAL CONTROLLER
// ==========================================
async function loadInstitutionsList() {
  try {
    const res = await fetch('/api/institutions');
    const { data } = await res.json();
    const sel = document.getElementById('instSelect');
    sel.innerHTML = data.map(i => `<option value="${i.id}" ${i.id === selectedInstitutionId ? 'selected' : ''}>${i.name}</option>`).join('');
    loadInstitutionData();
  } catch (err) {
    console.error('Error loading institutions:', err);
  }
}

async function loadInstitutionData() {
  selectedInstitutionId = document.getElementById('instSelect').value;
  try {
    // 1. Summary
    const sumRes = await fetch(`/api/institutions/${selectedInstitutionId}/summary`);
    const { institution, stats } = await sumRes.json();

    document.getElementById('instSubDetails').textContent = `AICTE ID: ${institution.aicte_id} · ${institution.state}, ${institution.district} · ${institution.institution_type}`;
    const compScore = (stats.total_claims === 0) ? 100 : (institution.compliance_score || 100);
    document.getElementById('instComplianceScore').textContent = `${compScore}%`;
    document.getElementById('instTotalClaims').textContent = stats.total_claims || 0;

    // 2. Seat Matrix
    const smRes = await fetch(`/api/institutions/${selectedInstitutionId}/seat-matrix`);
    const { seatMatrix } = await smRes.json();

    const smGrid = document.getElementById('instSeatMatrixGrid');
    smGrid.innerHTML = seatMatrix.map(m => `
      <div class="p-3.5 rounded-xl border ${m.isBreached ? 'bg-red-50/50 border-red-300' : 'bg-slate-50 border-slate-200'}">
        <div class="flex justify-between items-start">
          <span class="font-bold text-xs text-slate-800">${m.seat_category}</span>
          <span class="text-[10px] font-mono text-slate-400 font-medium">${m.aph_reference}</span>
        </div>
        <div class="mt-2 flex justify-between items-baseline">
          <span class="text-xl font-extrabold ${m.isBreached ? 'text-red-600' : 'text-slate-900'}">${m.enrolled}</span>
          <span class="text-xs text-slate-500">/ ${m.approved_intake} approved</span>
        </div>
        <!-- Progress bar -->
        <div class="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
          <div class="h-full rounded-full ${m.isBreached ? 'bg-red-600' : (m.utilizationPct > 80 ? 'bg-amber-500' : 'bg-indigo-600')}" style="width: ${Math.min(m.utilizationPct, 100)}%"></div>
        </div>
        <div class="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>${m.utilizationPct}% utilized</span>
          <span class="${m.isBreached ? 'text-red-600 font-bold' : ''}">${m.isBreached ? `+${m.excess} EXCESS BREACH` : `${m.vacant} vacant`}</span>
        </div>
      </div>
    `).join('');

    // 3. Claims List
    const claimsRes = await fetch(`/api/institutions/${selectedInstitutionId}/claims`);
    const { claims } = await claimsRes.json();

    const tbody = document.getElementById('instClaimsTableBody');
    if (!claims || claims.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-8 text-center text-slate-400">
            <i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 text-slate-300 block"></i>
            <span class="font-semibold text-slate-600 block text-xs">No Enrolment Claims Submitted Yet</span>
            <span class="text-[11px] text-slate-400 mt-1 block max-w-md mx-auto">
              This institution currently has 0 student records. Click <strong>Upload CSV</strong> above to submit <code class="font-mono bg-slate-100 px-1 py-0.5 rounded text-indigo-600">demo_live_batch.csv</code> or register a single claim to begin autonomous 5-layer verification.
            </span>
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = claims.map(c => {
        let badgeColor = 'bg-slate-100 text-slate-700';
        if (c.status === 'VERIFIED') badgeColor = 'bg-emerald-100 text-emerald-800';
        else if (c.status === 'COUNTERSIGNED') badgeColor = 'bg-teal-100 text-teal-900 border border-teal-300 font-bold';
        else if (c.status === 'FLAGGED') badgeColor = 'bg-amber-100 text-amber-800';
        else if (c.status === 'DISPUTED') badgeColor = 'bg-red-600 text-white font-bold animate-pulse';
        else if (c.status === 'REJECTED') badgeColor = 'bg-red-100 text-red-800';

        return `
          <tr class="hover:bg-slate-50/80">
            <td class="p-2.5 font-mono text-[11px] text-slate-500">${c.claim_id}</td>
            <td class="p-2.5">
              <span class="font-bold text-slate-900 block">${c.student_name}</span>
              <span class="font-mono text-[10px] text-slate-400">APAAR: ${c.apaar_id || 'PROVISIONAL'}</span>
            </td>
            <td class="p-2.5 font-medium text-slate-700">${c.seat_type}</td>
            <td class="p-2.5">
              <div class="flex space-x-1 text-[11px]" title="L1:Identity, L2:Admission, L3:Joining, L4:Duplicate, L5:Intake">
                <span class="${c.l1_identity_passed ? 'text-emerald-600' : 'text-red-500'}">L1</span>
                <span class="${c.l2_admission_passed ? 'text-emerald-600' : 'text-amber-500'}">L2</span>
                <span class="${c.l3_joining_passed ? 'text-emerald-600' : 'text-red-500'}">L3</span>
                <span class="${c.l4_duplicate_clear ? 'text-emerald-600' : 'text-red-600 font-bold'}">L4</span>
                <span class="${c.l5_data_integrity_passed ? 'text-emerald-600' : 'text-amber-500'}">L5</span>
              </div>
            </td>
            <td class="p-2.5">
              <span class="text-[10px] font-bold ${c.risk_score >= 50 ? 'text-red-600' : 'text-slate-600'}">${c.risk_score}</span>
            </td>
            <td class="p-2.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${badgeColor}">
                ${c.status}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Error loading institution data:', err);
  }
}

// Submit Single Claim
async function submitSingleClaim(e) {
  e.preventDefault();
  const payload = {
    institution_id: selectedInstitutionId,
    apaar_id: document.getElementById('claimApaar').value.trim(),
    student_name: document.getElementById('claimName').value.trim(),
    date_of_birth: document.getElementById('claimDob').value,
    seat_type: document.getElementById('claimSeatType').value,
    allotment_authority: document.getElementById('claimAuthority').value,
    allotment_reference: document.getElementById('claimAllotmentRef').value.trim(),
    fee_payment_reference: document.getElementById('claimFeeRef').value.trim()
  };

  try {
    const res = await fetch('/api/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`Claim Registered (${data.humanClaimId})! 5-Layer pipeline completed with status: ${data.pipelineResult.newStatus}`);
      document.getElementById('singleClaimForm').reset();
      loadInstitutionData();
    }
  } catch (err) {
    alert('Failed to submit claim: ' + err.message);
  }
}

// Bulk Upload Simulation
async function triggerSampleBulkUpload() {
  const sampleRecords = [
    {
      apaar_id: '640192837465',
      student_name: 'Priya Patel',
      date_of_birth: '2004-03-30',
      seat_type: 'Regular',
      fee_payment_reference: 'TXN' + Math.floor(Math.random() * 900000)
    },
    {
      apaar_id: '550182736452',
      student_name: 'Rajesh Nair',
      date_of_birth: '2004-07-18',
      seat_type: 'Regular',
      fee_payment_reference: 'TXN' + Math.floor(Math.random() * 900000)
    }
  ];

  try {
    const res = await fetch('/api/claims/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        institution_id: selectedInstitutionId,
        records: sampleRecords
      })
    });
    const data = await res.json();
    alert(`Bulk Upload Success: ${data.totalUploaded} records processed across 5 verification layers!`);
    loadInstitutionData();
  } catch (err) {
    alert('Bulk upload error: ' + err.message);
  }
}

// Real CSV File Upload Handler (Section 5.1 & 8.1)
function handleRealCsvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const csvText = e.target.result;
    try {
      const res = await fetch('/api/claims/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: selectedInstitutionId,
          csv_data: csvText
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Success! Uploaded & processed ${data.totalUploaded} student records from ${file.name}. 5-Layer verification executed.`);
        loadInstitutionData();
      } else {
        alert('Upload failed: ' + data.error);
      }
    } catch (err) {
      alert('Error uploading CSV: ' + err.message);
    }
    // reset input
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ==========================================
// 3. STUDENT PORTAL CONTROLLER
// ==========================================
async function loadStudentData() {
  selectedStudentApaar = document.getElementById('studentSelect').value;
  try {
    // 1. Student Identity Master
    const sRes = await fetch(`/api/student/${selectedStudentApaar}`);
    const { student, claims } = await sRes.json();

    document.getElementById('cardStudentName').textContent = student.name;
    document.getElementById('cardStudentGender').textContent = student.gender;
    document.getElementById('cardStudentDob').textContent = student.date_of_birth;
    document.getElementById('cardApaarId').textContent = student.apaar_id.replace(/(\d{4})/g, '$1 ').trim();

    // 2. Enrolment Claims
    const claimsContainer = document.getElementById('studentClaimsContainer');
    if (!claims || claims.length === 0) {
      claimsContainer.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <i class="fa-solid fa-user-clock text-3xl mb-2 text-slate-300 block"></i>
          <span class="font-semibold text-slate-600 block text-xs">No Enrolment Claims Recorded</span>
          <span class="text-[11px] text-slate-400 mt-1 block max-w-sm mx-auto">
            No institution has submitted an enrolment claim for this APAAR ID yet. Once an institution registers an admission claim, it will appear here for your cryptographic confirmation or dispute.
          </span>
        </div>`;
    } else {
      claimsContainer.innerHTML = claims.map(c => {
        const isDisputed = c.confirmation_status === 'DISPUTED';
        const isConfirmed = c.confirmation_status === 'CONFIRMED';
        const isCountersigned = c.status === 'COUNTERSIGNED';

        return `
          <div class="p-4 rounded-xl border ${isDisputed ? 'bg-red-50/60 border-red-300' : 'bg-slate-50 border-slate-200'} space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <span class="font-mono text-[10px] text-slate-400">${c.claim_id}</span>
                <h4 class="font-heading font-extrabold text-sm text-slate-900">${c.institution_name}</h4>
                <div class="text-xs text-slate-600 mt-0.5">${c.programme} - ${c.branch} (${c.academic_year}) · <span class="font-semibold">${c.seat_type}</span></div>
              </div>
              <span class="text-xs px-2.5 py-1 rounded font-extrabold ${isCountersigned ? 'bg-teal-100 text-teal-900 border border-teal-300' : (isDisputed ? 'bg-red-600 text-white' : (isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'))}">
                ${isCountersigned ? 'COUNTERSIGNED BY AICTE' : (isDisputed ? 'LOCKED / DISPUTED' : (isConfirmed ? 'CONFIRMED BY STUDENT' : 'PENDING YOUR CONFIRMATION'))}
              </span>
            </div>

            ${isDisputed ? `
              <div class="p-2.5 bg-red-100 border border-red-200 rounded-lg text-xs text-red-900">
                <strong>Your Dispute Reason:</strong> "${c.dispute_reason}"
                <div class="text-[10px] text-red-700 mt-0.5">Enrolment is frozen. An AICTE Regulatory Officer is reviewing the institutional claim.</div>
              </div>
            ` : ''}

            <!-- Action Buttons if not already confirmed/disputed -->
            ${!isConfirmed && !isDisputed ? `
              <div class="flex space-x-2 pt-2 border-t border-slate-200">
                <button onclick="confirmStudentEnrolment('${c.id}')" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center space-x-1.5">
                  <i class="fa-solid fa-check"></i>
                  <span>Confirm: "Yes, I Enrolled Here"</span>
                </button>
                <button onclick="disputeStudentEnrolment('${c.id}')" class="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center space-x-1.5">
                  <i class="fa-solid fa-ban"></i>
                  <span>Dispute: "I Never Took Admission"</span>
                </button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // 3. Credentials Wallet (W3C VCs)
    const credRes = await fetch(`/api/student/${selectedStudentApaar}/credentials`);
    const { credentials } = await credRes.json();

    const credContainer = document.getElementById('studentCredentialsContainer');
    if (credentials.length === 0) {
      credContainer.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">No countersigned W3C Verifiable Credentials issued yet. Once AICTE officers countersign your verified enrolment, your tamper-proof credential will appear here.</div>`;
    } else {
      credContainer.innerHTML = credentials.map(vc => `
        <div class="p-5 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-col sm:flex-row gap-5 items-center">
          <div class="w-32 h-32 flex-shrink-0">
            ${vc.qrSvg}
          </div>
          <div class="flex-1 text-xs space-y-1.5">
            <div class="flex items-center space-x-2">
              <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">W3C Verifiable Credential</span>
              <span class="font-mono text-slate-400 text-[10px]">Ed25519 Signed</span>
            </div>
            <h4 class="font-heading font-extrabold text-sm text-slate-900">${vc.programme} Enrolment Certificate</h4>
            <div class="text-slate-600">${vc.institution_name} · ${vc.academic_year}</div>
            <div class="font-mono text-[11px] text-indigo-700 font-semibold">Verification Code: ${vc.verification_code}</div>
            
            <div class="pt-2 flex flex-wrap gap-2">
              <button onclick="copyVerifyCode('${vc.verification_code}')" class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold text-[11px] transition shadow-sm">
                <i class="fa-regular fa-copy mr-1"></i> Copy Code
              </button>
              <button onclick="shareSelectiveDisclosure('${vc.verification_code}')" class="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg font-semibold text-[11px] transition shadow-sm" title="Share with selective disclosure: hide personal attributes">
                <i class="fa-solid fa-share-nodes mr-1"></i> Selective Share
              </button>
              <button onclick="switchToVerifierWithCode('${vc.verification_code}')" class="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-[11px] transition shadow-sm">
                <i class="fa-solid fa-qrcode mr-1"></i> Test in Verifier
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }

  } catch (err) {
    console.error('Error loading student data:', err);
  }
}

// Student Confirmation Actions
async function confirmStudentEnrolment(claimId) {
  try {
    const res = await fetch(`/api/student/confirmations/${claimId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'CONFIRMED' })
    });
    const data = await res.json();
    alert('Enrolment Confirmed! Your confirmation has been dispatched to AICTE.');
    loadStudentData();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function disputeStudentEnrolment(claimId) {
  const reason = prompt('Please state your reason for disputing this enrolment claim (e.g. "I never applied or took admission at this college"):', 'I never applied or enrolled here; my identity has been used without authorization.');
  if (!reason) return;

  try {
    const res = await fetch(`/api/student/confirmations/${claimId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'DISPUTED', dispute_reason: reason })
    });
    const data = await res.json();
    alert(data.message);
    loadStudentData();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function copyVerifyCode(code) {
  navigator.clipboard.writeText(code);
  alert(`Verification Code ${code} copied to clipboard!`);
}

// Student Selective Disclosure Presentation Generator (Section 8.3 & 12)
async function shareSelectiveDisclosure(code) {
  const discloseDob = confirm('Do you want to disclose your Date of Birth to the verifier?\n[OK = Yes, Cancel = Keep Private/Hidden]');
  const discloseApaar = confirm('Do you want to disclose your full APAAR ID to the verifier?\n[OK = Yes, Cancel = Keep Private/Hidden]');

  const disclosed_fields = ['studentName', 'institution', 'programme', 'academicYear'];
  if (discloseDob) disclosed_fields.push('dateOfBirth');
  if (discloseApaar) disclosed_fields.push('apaarId');

  try {
    const res = await fetch(`/api/student/credentials/${code}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disclosed_fields })
    });
    const data = await res.json();
    if (data.success) {
      const p = data.presentation;
      const sharedFieldsStr = Object.keys(p.fields).map(k => ` • ${k}: ${p.fields[k]}`).join('\n');
      alert(`🔐 Selective Disclosure Presentation Created!\n\nPresentation ID: ${p.presentationId}\nDigital Proof: Ed25519 (Signed)\n\nDisclosed Attributes:\n${sharedFieldsStr}\n\nAll other personal attributes are cryptographically sealed & hidden from verifiers.`);
    }
  } catch (err) {
    alert('Failed to generate selective disclosure: ' + err.message);
  }
}

function switchToVerifierWithCode(code) {
  switchPortal('verifier');
  document.getElementById('verifyInputCode').value = code;
  verifyCodeFromInput();
}

// ==========================================
// 4. PUBLIC VERIFIER CONTROLLER
// ==========================================
async function loadQuickVerifySamples() {
  const container = document.getElementById('quickVerifySamples');
  try {
    const res = await fetch('/api/credentials/latest');
    const { credential } = await res.json();
    if (credential && credential.verification_code) {
      container.innerHTML = `
        <button onclick="document.getElementById('verifyInputCode').value='${credential.verification_code}'; verifyCodeFromInput();" class="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 px-3 py-1 rounded-lg font-mono font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs">
          <i class="fa-solid fa-certificate text-purple-600"></i>
          <span>Verify Live: ${credential.verification_code} (${credential.student_name})</span>
        </button>
        <button onclick="document.getElementById('verifyInputCode').value='VP-SAMPLE-2026'; verifyCodeFromInput();" class="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2.5 py-1 rounded-lg font-mono text-xs font-semibold transition cursor-pointer">
          <span>AICTE Sample Key (VP-SAMPLE-2026)</span>
        </button>
      `;
    } else {
      container.innerHTML = `
        <button onclick="document.getElementById('verifyInputCode').value='VP-SAMPLE-2026'; verifyCodeFromInput();" class="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 px-3 py-1 rounded-lg font-mono font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs">
          <i class="fa-solid fa-certificate text-purple-600"></i>
          <span>Sample: VP-SAMPLE-2026 (Priya Patel)</span>
        </button>
        <button onclick="document.getElementById('verifyInputCode').value='640192837465'; verifyCodeFromInput();" class="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2.5 py-1 rounded-lg font-mono text-xs font-semibold transition cursor-pointer">
          <span>By APAAR: 640192837465</span>
        </button>
      `;
    }
  } catch (e) {
    container.innerHTML = `
      <button onclick="document.getElementById('verifyInputCode').value='VP-SAMPLE-2026'; verifyCodeFromInput();" class="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 px-3 py-1 rounded-lg font-mono font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs">
        <i class="fa-solid fa-certificate text-purple-600"></i>
        <span>Sample: VP-SAMPLE-2026 (Priya Patel)</span>
      </button>
    `;
  }
}

async function verifyCodeFromInput() {
  const code = document.getElementById('verifyInputCode').value.trim();
  if (!code) return;

  const box = document.getElementById('verificationResultBox');
  box.classList.remove('hidden');
  box.innerHTML = `<div class="p-6 text-center text-slate-400">Verifying cryptographic digital signature...</div>`;

  try {
    const res = await fetch(`/api/verify/${code}`);
    const data = await res.json();

    if (!data.valid) {
      box.innerHTML = `
        <div class="p-5 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-2">
          <div class="font-heading font-extrabold text-base flex items-center space-x-2 text-red-700">
            <i class="fa-solid fa-circle-xmark text-lg"></i>
            <span>INVALID CREDENTIAL PROOF</span>
          </div>
          <p class="text-xs">${data.error || 'The digital signature does not match or the record has been revoked by AICTE.'}</p>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div class="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-white border border-emerald-300 text-slate-900 shadow-md space-y-4">
          <div class="flex justify-between items-start">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg font-bold">
                <i class="fa-solid fa-certificate"></i>
              </div>
              <div>
                <span class="text-[10px] tracking-wider uppercase font-bold text-emerald-800">Authentic & Valid Enrolment</span>
                <h3 class="font-heading font-extrabold text-lg text-emerald-950">${data.studentName}</h3>
              </div>
            </div>
            <span class="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center space-x-1">
              <i class="fa-solid fa-check text-[10px]"></i>
              <span>OFFICIAL COUNTERSIGNED</span>
            </span>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs bg-white/80 p-3.5 rounded-xl border border-emerald-200">
            <div>
              <span class="text-slate-500 block text-[11px]">Academic Institution:</span>
              <span class="font-bold text-slate-900">${data.institutionName}</span>
            </div>
            <div>
              <span class="text-slate-500 block text-[11px]">Programme & Batch:</span>
              <span class="font-bold text-slate-900">${data.programme} (${data.academicYear})</span>
            </div>
            <div>
              <span class="text-slate-500 block text-[11px]">APAAR Identifier:</span>
              <span class="font-mono font-bold text-slate-800">${data.apaarId}</span>
            </div>
            <div>
              <span class="text-slate-500 block text-[11px]">Signature Standard:</span>
              <span class="font-mono text-emerald-700 font-bold">${data.signatureAlgorithm} (Ed25519)</span>
            </div>
          </div>

          <div class="text-[10px] text-slate-500 font-mono flex justify-between items-center pt-2 border-t border-emerald-200">
            <span>Issuer: ${data.issuerDid}</span>
            <span>Digital Hash: ${data.digitalSignatureHash}</span>
          </div>
        </div>
      `;
    }

  } catch (err) {
    box.innerHTML = `<div class="p-4 text-center text-red-500">Verification service error: ${err.message}</div>`;
  }
}

// ==========================================
// 5. REGULATORY AUDIT CASE SCENARIOS
// ==========================================
const scenarioExplanations = {
  genuine: {
    badge: 'Case 01 · Standard Admission',
    text: 'Student Ananya Verma (APAAR: 8201-9482-7103) cleared all 5 verification layers. Student confirmed admission; AICTE countersigned and issued W3C Verifiable Credential with Ed25519 digital signature.'
  },
  ghost: {
    badge: 'Case 02 · Ghost Identity Alert',
    text: 'Aarav Gupta submitted with fictitious APAAR (9999-9999-9999). Layer 1 failed (Ghost Identity Alert). System assigned Risk Score 65 (HIGH) and routed to Priority Investigation Queue.'
  },
  duplicate: {
    badge: 'Case 03 · Dual Enrolment Caught',
    text: 'Vikramaditya Rao (APAAR: 7302-8471-9284) claimed by ABC Tech AND Delhi College. Layer 4 caught simultaneous degree-granting enrolment. Both institutions and AICTE alerted.'
  },
  nri: {
    badge: 'Case 04 · Statutory Quota Breach',
    text: 'ABC Tech enrolled 11 NRI students against approved sanction of 9. Seat Ledger triggered AICTE Approval Process Handbook (APH) Section 4.3.2 statutory violation alert (+2 excess seats).'
  },
  dispute: {
    badge: 'Case 05 · Student Enrolment Dispute',
    text: 'Student Rohan Sharma independently signed into portal and reported: "I never took admission here". System automatically froze claim, escalated to CRITICAL priority, and locked credential minting.'
  }
};

async function runScenario(type) {
  // Update button active styles
  document.querySelectorAll('.scenario-btn').forEach(btn => {
    btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-400');
    btn.classList.add('bg-slate-800', 'text-slate-200', 'border-slate-700');
  });
  const activeBtn = document.getElementById(`btn-scen-${type}`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-slate-800', 'text-slate-200', 'border-slate-700');
    activeBtn.classList.add('bg-blue-600', 'text-white', 'border-blue-400');
  }

  // Update explanation banner
  const exp = scenarioExplanations[type];
  if (exp) {
    const badgeEl = document.getElementById('activeScenarioBadge');
    const textEl = document.getElementById('scenarioExplanationText');
    if (badgeEl) badgeEl.textContent = exp.badge;
    if (textEl) textEl.textContent = exp.text;
  }

  // Check if claims exist in priority queue or institution list
  try {
    const qRes = await fetch('/api/aicte/risk-queue');
    const { queue } = await qRes.json();
    
    if (type === 'nri') {
      switchPortal('aicte');
      switchAicteTab('ledger');
      return;
    }

    if (type === 'ghost') {
      switchPortal('aicte');
      const ghostCase = queue.find(c => c.l1_identity_passed === 0 || c.id === 'claim_ghost');
      if (ghostCase) {
        inspectCase(ghostCase.id);
      } else {
        alert('No Ghost Identity claim found in the database. Please go to the Institution Portal and upload the demo CSV batch first!');
      }
    } else if (type === 'duplicate') {
      switchPortal('aicte');
      const dupCase = queue.find(c => c.l4_duplicate_clear === 0 || c.id === 'claim_vikram_abc');
      if (dupCase) {
        inspectCase(dupCase.id);
      } else {
        alert('No Dual Enrolment claim found in the database. Please go to the Institution Portal and upload the demo CSV batch first!');
      }
    } else if (type === 'dispute') {
      switchPortal('aicte');
      const dispCase = queue.find(c => c.status === 'DISPUTED' || c.id === 'claim_rohan_abc');
      if (dispCase) {
        inspectCase(dispCase.id);
      } else {
        alert('No Disputed claim found in the database. In the Student Portal, students can independently confirm or dispute any admission claim.');
      }
    } else if (type === 'genuine') {
      switchPortal('student');
      loadStudentData();
    }
  } catch (err) {
    console.error('Scenario error:', err);
  }
}

async function resetDemo() {
  if (!confirm('Reset VidyaPramaan to pristine clean state (0 claims)?\nAll student claims will be cleared so nothing is visible before demo upload.')) return;
  try {
    const res = await fetch('/api/demo/reset', { method: 'POST' });
    const data = await res.json();
    alert('System reset to clean state (0 claims). Nothing about student data is visible until demo CSV is uploaded.');
    activeCaseClaimId = null;
    if (currentPortal === 'institution') {
      loadInstitutionData();
    } else if (currentPortal === 'student') {
      loadStudentData();
    } else if (currentPortal === 'verifier') {
      loadQuickVerifySamples();
    } else {
      loadAicteData();
    }
  } catch (e) {
    alert('Reset failed: ' + e.message);
  }
}

// Boot default: Guarantee pristine 0-claims state on every browser page load/refresh
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await fetch('/api/demo/reset', { method: 'POST' });
  } catch (e) {
    console.error('Auto-clean on boot error:', e);
  }
  switchPortal('institution');
});
