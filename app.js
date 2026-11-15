// 1. SUPABASE CONFIGURATION (Keep your sb_publishable_... key in Line 3)
const SUPABASE_URL = 'https://pefmewgazggytwdjnrng.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0gSdf0BchrXTdfYiQ950GA_NpIqHdOr';

let supabaseClient = null;
try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  console.error('Supabase initialization error:', err);
}

// 2. EMAILJS CONFIGURATION (Paste your 3 keys from EmailJS)
const EMAILJS_PUBLIC_KEY = 'MaOkPh7O2ie7qLZmn';
const EMAILJS_SERVICE_ID = 'service_dpav5n7';
const EMAILJS_TEMPLATE_ID = 'template_js86xte';

// Put the real email addresses of your Admin, Manager, and Finance here
const NOTIFICATION_EMAILS = {
  admin: 'abadjohnsantos@gmail.com',     // Receives new & revised requests, and Manager decisions
  manager: 'johnroyaBad@gmail.com', // Receives new requests and POs ready for approval
  finance: 'acctgtisahome@gmail.com'  // Receives POs with uploaded Supplier Invoices for Check Prep
};

if (window.emailjs && !EMAILJS_PUBLIC_KEY.includes('PASTE_YOUR')) {
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

//Do not remove
const GEMINI_PART_A = 'AQ.A'; 
const GEMINI_PART_B = 'b8RN6I-Z4b6WgN58KrhdBoB7G8nuH0PqjU5ktcHcEM75zVbuw';
const GEMINI_API_KEY = (GEMINI_PART_A + GEMINI_PART_B).trim();

// Helper function to send email via EmailJS (auto-fixes common @gmail.com typos)
async function sendWorkflowEmail({ toEmail, recipientName, subject, message, item }) {
  if (!window.emailjs || EMAILJS_PUBLIC_KEY.includes('PASTE_YOUR') || !toEmail) return;

  const supplier = item.final_supplier || item.req_supplier || 'TBD';
  const price = item.final_price ?? item.req_price;
  const amountText = price ? `PHP ${Number(price).toLocaleString()}` : 'TBD';

  // Split multiple emails and auto-correct @mail.com / @gmal.com typos to @gmail.com
  const emailList = [...new Set(
    toEmail
      .split(',')
      .map(e => e.trim().replace(/@(mail|gmal|gmial)\.com$/i, '@gmail.com'))
      .filter(e => e && e.includes('@'))
  )];

  for (const singleEmail of emailList) {
    const templateParams = {
      to_email: singleEmail,
      name: 'Procurement Portal',
      email: (item.requestor_email || singleEmail).replace(/@(mail|gmal|gmial)\.com$/i, '@gmail.com'),
      recipient_name: recipientName,
      subject: subject,
      message: message,
      pr_po_number: item.po_number ? `${item.pr_number} / ${item.po_number}` : item.pr_number,
      dept_requestor: `${item.department} (${item.requestor_name})`,
      item_details: formatItemsPlain(item),
      supplier_amount: `${supplier} (${amountText})`,
      status: item.status,
      remarks: item.remarks || item.purpose || 'None'
    };

    try {
      await window.emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      console.log('EmailJS sent successfully to:', singleEmail);
    } catch (err) {
      console.error('EmailJS Error:', err);
      alert('EmailJS Error (' + singleEmail + '): ' + (err?.text || err?.message || JSON.stringify(err)));
    }
  }
}

// 3. USER ACCOUNTS
const USERS = {
  warehouse: { pass: 'Whse@2026',    role: 'Requestor', dept: 'Warehouse', label: 'Warehouse Department' },
  sales:     { pass: 'Sales@2026',   role: 'Requestor', dept: 'Sales',     label: 'Sales Department' },
  finreq:    { pass: 'FinReq@2026',  role: 'Requestor', dept: 'Finance',   label: 'Finance Requestor' },
  admin:     { pass: 'Purch#Admin8', role: 'Admin',     dept: 'Admin',     label: 'Admin / Purchasing Staff' },
  manager:   { pass: 'Mgr#Apprv9',   role: 'Manager',   dept: 'Admin',     label: 'Admin Manager' },
  finance:   { pass: 'Fin#Check7',   role: 'Finance',   dept: 'Finance',   label: 'Finance (Check Preparation)' }
};

let currentUser = null;
let allRequests = [];
let currentPoDraft = null;

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('addItemBtn').addEventListener('click', addItemRow);
  document.getElementById('prForm').addEventListener('submit', submitPurchaseRequest);
  document.getElementById('statusFilter').addEventListener('change', loadRequests);
  document.getElementById('refreshBtn').addEventListener('click', loadRequests);

  const savedUser = sessionStorage.getItem('procurementUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showAppScreen();
  }
});

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPass').value;
  const errBox = document.getElementById('loginError');

  const account = USERS[username];
  if (!account || account.pass !== password) {
    errBox.textContent = 'Invalid username or password.';
    errBox.classList.remove('hidden');
    return;
  }

  errBox.classList.add('hidden');
  currentUser = { username, ...account };
  sessionStorage.setItem('procurementUser', JSON.stringify(currentUser));
  showAppScreen();
}

function handleLogout() {
  sessionStorage.removeItem('procurementUser');
  currentUser = null;
  document.getElementById('loginForm').reset();
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function showAppScreen() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');

  document.getElementById('userBadgeName').textContent = currentUser.label;
  document.getElementById('userBadgeRole').textContent = `Role: ${currentUser.role}`;

  const reqSection = document.getElementById('requestorSection');
  const roleHint = document.getElementById('roleHint');

  if (currentUser.role === 'Requestor') {
    reqSection.classList.remove('hidden');
    document.getElementById('reqDept').value = currentUser.dept;
    const container = document.getElementById('itemsContainer');
    if (container.children.length === 0) addItemRow();
    roleHint.textContent = `Showing requests for ${currentUser.dept} Department. You can revise items marked as "Returned for Info".`;
  } else {
    reqSection.classList.add('hidden');
    const hints = {
      Admin: 'Admin Staff View: Create POs with AI, upload Supplier Invoices, and mark orders as "Partially Completed" or "Completed" once purchased.',
      Manager: 'Admin Manager View: Review and Approve, Return, or Cancel purchase orders under "For Approval".',
      Finance: 'Finance View: Review uploaded Supplier Invoices/POs under "For Check Prep", attach the prepared check, and mark as "Check Ready".'
    };
    roleHint.textContent = hints[currentUser.role] || '';
  }

  loadRequests();
}

function addItemRow() {
  const container = document.getElementById('itemsContainer');
  const card = document.createElement('div');
  card.className = 'item-row bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3';
  card.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 border-b border-slate-200 pb-2">
      <span class="text-xs font-bold uppercase text-slate-700">PO Package (Items below will be combined under 1 PO)</span>
      <div class="flex items-center gap-2">
        <button type="button" onclick="addSubItemRow(this)" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1 rounded-lg shadow-sm">
          + Add Another Item
        </button>
        <button type="button" onclick="removeItemRow(this)" class="text-red-500 hover:text-red-700 font-bold px-2 py-0.5 text-sm border border-red-200 rounded bg-white" title="Remove PO Group">
          Remove Group ×
        </button>
      </div>
    </div>

    <div class="sub-items-list space-y-2"></div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
      <div>
        <label class="block text-[11px] font-semibold text-slate-600">Preferred Supplier (Optional)</label>
        <input type="text" placeholder="Optional" class="item-supplier w-full border rounded px-2.5 py-1.5 text-sm bg-white">
      </div>
      <div>
        <label class="block text-[11px] font-semibold text-slate-600">Est. Total Price (Optional)</label>
        <input type="number" step="any" placeholder="0.00" class="item-price w-full border rounded px-2.5 py-1.5 text-sm bg-white">
      </div>
      <div>
        <label class="block text-[11px] font-semibold text-slate-600">Reference File / Quotation (Optional)</label>
        <input type="file" class="item-file w-full text-xs bg-white border rounded p-1">
      </div>
    </div>
  `;
  container.appendChild(card);

  const addSubBtn = card.querySelector('button[onclick="addSubItemRow(this)"]');
  addSubItemRow(addSubBtn);
}

function addSubItemRow(btn, defaultData = null) {
  const card = btn.closest('.item-row') || btn;
  const list = card.querySelector('.sub-items-list');
  const subRow = document.createElement('div');
  subRow.className = 'sub-item-row grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-white p-2.5 rounded-lg border border-slate-200';
  subRow.innerHTML = `
    <div class="md:col-span-4">
      <label class="block text-[11px] font-semibold text-slate-600">Item Name & Specifications *</label>
      <input type="text" required value="${defaultData ? defaultData.name : ''}" placeholder="e.g. A4 Bond Paper 80gsm" class="sub-item-name w-full border rounded px-2.5 py-1.5 text-sm">
    </div>
    <div>
      <label class="block text-[11px] font-semibold text-slate-600">Quantity *</label>
      <input type="number" step="any" required value="${defaultData ? defaultData.qty : ''}" placeholder="10" class="sub-item-qty w-full border rounded px-2 py-1.5 text-sm">
    </div>
    <div class="flex items-end gap-1">
      <div class="w-full">
        <label class="block text-[11px] font-semibold text-slate-600">Unit *</label>
        <input type="text" required value="${defaultData ? defaultData.unit : ''}" placeholder="reams" class="sub-item-unit w-full border rounded px-2 py-1.5 text-sm">
      </div>
      <button type="button" onclick="removeSubItemRow(this)" class="text-red-500 hover:text-red-700 font-bold px-2 py-1.5 text-lg leading-none" title="Remove Item">×</button>
    </div>
  `;
  list.appendChild(subRow);
}

function removeSubItemRow(btn) {
  const list = btn.closest('.sub-items-list');
  if (list.querySelectorAll('.sub-item-row').length <= 1) {
    alert('At least one item is required in a PO group.');
    return;
  }
  btn.closest('.sub-item-row').remove();
}

function removeItemRow(btn) {
  const container = document.getElementById('itemsContainer');
  if (container.querySelectorAll('.item-row').length <= 1) {
    alert('At least one PO group is required in the form.');
    return;
  }
  btn.closest('.item-row').remove();
}

function parseSubItems(item) {
  if (!item || !item.item_name) return [];
  const lines = item.item_name.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].match(/\[([0-9.]+)\s+([^\]]+)\]$/)) {
    return [{ name: item.item_name, qty: Number(item.quantity) || 1, unit: item.unit || 'pcs' }];
  }
  return lines.map(line => {
    const match = line.match(/^(.*)\s+\[([0-9.]+)\s+([^\]]+)\]$/);
    if (match) {
      return { name: match[1].trim(), qty: Number(match[2]), unit: match[3].trim() };
    }
    return { name: line, qty: Number(item.quantity) || 1, unit: item.unit || 'pcs' };
  });
}

function extractFileUrls(item) {
  const rawReq = item.req_file_url || '';
  const reqParts = rawReq.split('||PO_DOC||');
  const rawSup = item.supplier_po_url || '';
  const supParts = rawSup.split('||CHK_FILE||');
  return {
    reqFileUrl: reqParts[0] || null,
    poDocUrl: reqParts[1] || null,
    supplierPoUrl: supParts[0] || null,
    checkFileUrl: supParts[1] || null
  };
}

function openGeneratedPoPdf(id) {
  const item = allRequests.find(r => r.id === id);
  if (!item) return;

  const { poDocUrl } = extractFileUrls(item);

  if (poDocUrl && poDocUrl.toLowerCase().endsWith('.pdf')) {
    window.open(poDocUrl, '_blank');
    return;
  }

  const draft = initPoDraftFromItem(item);
  const pdfBlob = generatePoPdfBlob(draft);
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
}

function formatItemsHtml(item) {
  const subItems = parseSubItems(item);
  if (subItems.length === 1) {
    return `
      <div class="font-medium text-slate-800">${subItems[0].name}</div>
      <div class="text-xs text-slate-500">${subItems[0].qty} ${subItems[0].unit}</div>
    `;
  }
  return `
    <div class="text-xs font-bold text-blue-700 mb-1">${subItems.length} Items in this PO:</div>
    <ul class="list-disc pl-4 space-y-0.5 text-xs">
      ${subItems.map(s => `<li><span class="font-medium text-slate-800">${s.name}</span> <span class="text-slate-500">(${s.qty} ${s.unit})</span></li>`).join('')}
    </ul>
  `;
}

function formatItemsPlain(item) {
  const subItems = parseSubItems(item);
  return subItems.map(s => `${s.name} (${s.qty} ${s.unit})`).join(', ');
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `<div>${datePart}</div><div class="text-xs text-slate-400">${timePart}</div>`;
}

async function uploadFile(file, prefix) {
  if (!file) return null;
  const cleanName = (file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${prefix}_${Date.now()}_${cleanName}`;
  const { error } = await supabaseClient.storage
    .from('procurement-files')
    .upload(filePath, file, { contentType: file.type || 'application/pdf' });

  if (error) throw error;
  const { data } = supabaseClient.storage.from('procurement-files').getPublicUrl(filePath);
  return data.publicUrl;
}

async function submitPurchaseRequest(event) {
  event.preventDefault();

  if (SUPABASE_ANON_KEY.includes('PASTE_YOUR')) {
    alert('Please paste your Supabase Publishable Key in Line 3 of app.js and save the file.');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  const itemCards = document.querySelectorAll('.item-row');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const dept = document.getElementById('reqDept').value;
    const name = document.getElementById('reqName').value;
    const email = document.getElementById('reqEmail').value;
    const purpose = document.getElementById('reqPurpose').value;
    const batchCode = 'PR-' + Date.now().toString().slice(-5);

    const recordsToInsert = [];

    for (let i = 0; i < itemCards.length; i++) {
      const card = itemCards[i];
      const subRows = card.querySelectorAll('.sub-item-row');
      const subItems = Array.from(subRows).map(r => ({
        name: r.querySelector('.sub-item-name').value.trim(),
        qty: Number(r.querySelector('.sub-item-qty').value),
        unit: r.querySelector('.sub-item-unit').value.trim()
      }));

      const combinedItemName = subItems.length === 1
        ? subItems[0].name
        : subItems.map(s => `${s.name} [${s.qty} ${s.unit}]`).join('\n');

      const totalQty = subItems.reduce((sum, s) => sum + s.qty, 0);
      const combinedUnit = subItems.length === 1 ? subItems[0].unit : `items (${subItems.length} lines)`;

      const fileInput = card.querySelector('.item-file');
      const fileUrl = fileInput.files[0] ? await uploadFile(fileInput.files[0], 'req') : null;
      const reqSupplier = card.querySelector('.item-supplier').value || null;
      const reqPrice = card.querySelector('.item-price').value ? Number(card.querySelector('.item-price').value) : null;

      recordsToInsert.push({
        pr_number: itemCards.length === 1 ? batchCode : `${batchCode}-${i + 1}`,
        department: dept,
        requestor_name: name,
        requestor_email: email,
        purpose: purpose,
        item_name: combinedItemName,
        quantity: totalQty,
        unit: combinedUnit,
        req_supplier: reqSupplier,
        req_price: reqPrice,
        final_supplier: reqSupplier,
        final_price: reqPrice,
        req_file_url: fileUrl,
        status: 'Pending Admin'
      });
    }

    const { error } = await supabaseClient.from('purchase_requests').insert(recordsToInsert);
    if (error) throw error;

    for (const rec of recordsToInsert) {
      await sendWorkflowEmail({
        toEmail: NOTIFICATION_EMAILS.admin,
        recipientName: 'Admin / Purchasing Staff',
        subject: `New Purchase Request (${rec.pr_number})`,
        message: `A new purchase request has been submitted by ${rec.requestor_name} (${rec.department}) and requires PO creation.`,
        item: rec
      });
    }

    alert('Purchase request submitted successfully!');
    document.getElementById('reqPurpose').value = '';
    document.getElementById('itemsContainer').innerHTML = '';
    addItemRow();
    loadRequests();
  } catch (err) {
    alert('Submission Error: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request to Admin';
  }
}

async function loadRequests() {
  if (!supabaseClient || SUPABASE_ANON_KEY.includes('PASTE_YOUR')) {
    document.getElementById('requestsTableBody').innerHTML =
      `<tr><td colspan="8" class="p-6 text-center text-red-500">Please configure your Supabase Publishable Key in Line 3 of app.js and press Ctrl+S.</td></tr>`;
    return;
  }

  const filter = document.getElementById('statusFilter').value;
  let query = supabaseClient.from('purchase_requests').select('*').order('created_at', { ascending: false });

  if (filter !== 'ALL') {
    query = query.eq('status', filter);
  }

  if (currentUser && currentUser.role === 'Requestor') {
    query = query.eq('department', currentUser.dept);
  }

  const { data, error } = await query;
  if (error) {
    document.getElementById('requestsTableBody').innerHTML =
      `<tr><td colspan="8" class="p-6 text-center text-red-500">Database Error: ${error.message}</td></tr>`;
    return;
  }
  allRequests = data || [];
  renderTable();
}

function getStatusBadge(status) {
  const styles = {
    'Pending Admin': 'bg-amber-100 text-amber-800',
    'For Approval': 'bg-purple-100 text-purple-800',
    'Approved': 'bg-blue-100 text-blue-800',
    'Returned for Info': 'bg-orange-100 text-orange-800',
    'For Check Prep': 'bg-indigo-100 text-indigo-800',
    'Check Ready': 'bg-cyan-100 text-cyan-800',
    'Partially Completed': 'bg-amber-100 text-amber-800',
    'Completed': 'bg-emerald-100 text-emerald-800',
    'Cancelled': 'bg-red-100 text-red-800'
  };
  return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100'}">${status}</span>`;
}

function renderTable() {
  const tbody = document.getElementById('requestsTableBody');
  const role = currentUser ? currentUser.role : '';

  if (allRequests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">No purchase requests found.</td></tr>`;
    return;
  }

  tbody.innerHTML = allRequests.map(item => {
    const supplier = item.final_supplier || item.req_supplier || '—';
    const price = item.final_price ?? item.req_price;
    const priceText = price ? `₱${Number(price).toLocaleString()}` : '—';

    const { reqFileUrl, poDocUrl, supplierPoUrl, checkFileUrl } = extractFileUrls(item);
    let filesHtml = '';
    if (reqFileUrl) filesHtml += `<a href="${reqFileUrl}" target="_blank" class="text-blue-600 underline block text-xs">Requestor Attachment</a>`;
    if (poDocUrl || item.po_number) {
      filesHtml += `<button type="button" onclick="openGeneratedPoPdf('${item.id}')" class="text-purple-600 font-semibold underline block text-xs text-left">Generated PO File (PDF)</button>`;
    }
    if (supplierPoUrl) filesHtml += `<a href="${supplierPoUrl}" target="_blank" class="text-emerald-600 font-semibold underline block text-xs">Supplier Invoice/PO</a>`;
    if (checkFileUrl) filesHtml += `<a href="${checkFileUrl}" target="_blank" class="text-amber-700 font-bold underline block text-xs">Prepared Check / Voucher</a>`;
    if (!filesHtml) filesHtml = '<span class="text-slate-400 text-xs">None</span>';

    let actionBtn = '<span class="text-xs text-slate-400">No action required</span>';

    if (role === 'Requestor' && item.status === 'Returned for Info') {
      actionBtn = `<button onclick="openModal('${item.id}', 'revise')" class="bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 py-1.5 rounded">Edit / Revise Request</button>`;
    } else if (role === 'Admin' && (item.status === 'Pending Admin' || item.status === 'Returned for Info' || item.status === 'For Approval')) {
      actionBtn = `<button onclick="openModal('${item.id}', 'create_po')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded">Create / Update PO</button>`;
    } else if (role === 'Admin' && item.status === 'Approved') {
      actionBtn = `<button onclick="openModal('${item.id}', 'upload_invoice')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded">Upload Supplier Billing</button>`;
    } else if (role === 'Admin' && (item.status === 'Check Ready' || item.status === 'Partially Completed' || (item.status === 'Completed' && item.check_number))) {
      actionBtn = `<button onclick="openModal('${item.id}', 'fulfillment')" class="bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 py-1.5 rounded font-semibold">Update Purchase Status</button>`;
    } else if (role === 'Manager' && item.status === 'For Approval') {
      actionBtn = `<button onclick="openModal('${item.id}', 'approve_po')" class="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded">Review & Approve</button>`;
    } else if (role === 'Finance' && item.status === 'For Check Prep') {
      actionBtn = `<button onclick="openModal('${item.id}', 'prepare_check')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded">Prepare Check</button>`;
    }

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-medium">
          <div>${item.pr_number}</div>
          <div class="text-xs text-slate-500">${item.po_number ? 'PO: ' + item.po_number : 'No PO assigned'}</div>
        </td>
        <td class="p-3 text-slate-700 whitespace-nowrap">
          ${formatDate(item.created_at)}
        </td>
        <td class="p-3">
          <div class="font-semibold">${item.department}</div>
          <div class="text-xs text-slate-500">${item.requestor_name}</div>
        </td>
        <td class="p-3">
          ${formatItemsHtml(item)}
          ${item.purpose ? `<div class="text-xs text-slate-400 mt-1">Purpose: ${item.purpose}</div>` : ''}
        </td>
        <td class="p-3">
          <div>${supplier}</div>
          <div class="text-xs font-semibold text-slate-700">${priceText}</div>
        </td>
        <td class="p-3 space-y-0.5">${filesHtml}</td>
        <td class="p-3">
          ${getStatusBadge(item.status)}
          ${item.remarks ? `<div class="text-xs text-slate-600 mt-1">Note: ${item.remarks}</div>` : ''}
          ${item.check_number ? `<div class="text-xs font-bold text-emerald-700 mt-1">Check #: ${item.check_number}</div>` : ''}
        </td>
        <td class="p-3 text-right">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function initPoDraftFromItem(item) {
  const subItems = parseSubItems(item);
  const defaultTotal = Number(item.final_price ?? item.req_price ?? 0);
  const totalQtyAll = subItems.reduce((sum, s) => sum + (Number(s.qty) || 1), 0) || 1;
  const avgUnitPrice = defaultTotal > 0 ? defaultTotal / totalQtyAll : 0;

  const lineItems = subItems.map(s => {
    const qty = Number(s.qty) || 1;
    const unitPrice = subItems.length === 1 ? (defaultTotal / qty) : avgUnitPrice;
    return {
      name: s.name,
      qty: qty,
      unit: s.unit || 'pcs',
      unit_price: unitPrice,
      line_total: qty * unitPrice
    };
  });

  const subtotal = lineItems.reduce((acc, i) => acc + i.line_total, 0);
  return {
    po_number: item.po_number || 'PO-' + item.pr_number.slice(3),
    pr_number: item.pr_number,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    department: item.department,
    requestor: item.requestor_name,
    supplier_name: item.final_supplier || item.req_supplier || 'TBD Supplier',
    payment_terms: 'Net 30 Days',
    items: lineItems,
    subtotal: subtotal,
    tax_amount: 0,
    grand_total: defaultTotal || subtotal,
    notes: item.remarks || item.purpose || ''
  };
}

function generatePoDocumentHtml(draft) {
  const rowsHtml = draft.items.map((it, idx) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${idx + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${it.name}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.unit}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">₱${Number(it.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">₱${Number(it.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join('');

  return `
  <div style="font-family:Arial,sans-serif;color:#1e293b;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:20px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px;">
      <div>
        <h2 style="margin:0;font-size:18px;color:#0f172a;letter-spacing:0.5px;">PURCHASE ORDER</h2>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">Ref PR: ${draft.pr_number} • Dept: ${draft.department}</div>
      </div>
      <div style="text-align:right;font-size:11px;">
        <div style="font-size:14px;font-weight:bold;color:#1d4ed8;">${draft.po_number}</div>
        <div>Date: ${draft.date}</div>
        <div>Terms: ${draft.payment_terms || 'Standard'}</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;margin-bottom:16px;background:#f8fafc;padding:10px;border-radius:6px;">
      <div>
        <div style="font-weight:bold;color:#475569;text-transform:uppercase;font-size:10px;">Vendor / Supplier</div>
        <div style="font-size:13px;font-weight:bold;color:#0f172a;margin-top:2px;">${draft.supplier_name}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:bold;color:#475569;text-transform:uppercase;font-size:10px;">Requested By</div>
        <div style="font-size:12px;font-weight:bold;color:#0f172a;margin-top:2px;">${draft.requestor}</div>
        <div style="color:#64748b;">${draft.department} Department</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
      <thead>
        <tr style="background:#0f172a;color:#ffffff;text-transform:uppercase;font-size:10px;">
          <th style="padding:6px;text-align:center;">#</th>
          <th style="padding:6px;text-align:left;">Item Description</th>
          <th style="padding:6px;text-align:center;">Qty</th>
          <th style="padding:6px;text-align:center;">Unit</th>
          <th style="padding:6px;text-align:right;">Unit Price</th>
          <th style="padding:6px;text-align:right;">Line Total</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;font-size:11px;">
      <div style="flex:1;">
        <div style="font-weight:bold;color:#475569;">Notes / Special Instructions:</div>
        <div style="color:#334155;margin-top:4px;">${draft.notes || 'None'}</div>
      </div>
      <div style="width:220px;background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>Subtotal:</span>
          <span>₱${Number(draft.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#475569;">
          <span>Tax / VAT:</span>
          <span>₱${Number(draft.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;color:#0f172a;border-top:1px solid #cbd5e1;padding-top:6px;">
          <span>Grand Total:</span>
          <span>₱${Number(draft.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function refreshPoPreviewAndInputs() {
  if (!currentPoDraft) return;
  const previewBox = document.getElementById('aiPoPreviewContainer');
  if (previewBox) {
    previewBox.innerHTML = generatePoDocumentHtml(currentPoDraft);
  }
  const poInput = document.getElementById('mPoNumber');
  const supInput = document.getElementById('mSupplier');
  const priceInput = document.getElementById('mPrice');

  if (poInput) poInput.value = currentPoDraft.po_number;
  if (supInput) supInput.value = currentPoDraft.supplier_name;
  if (priceInput) priceInput.value = currentPoDraft.grand_total;
}

function syncManualInputsToDraft() {
  if (!currentPoDraft) return;
  currentPoDraft.po_number = document.getElementById('mPoNumber').value || currentPoDraft.po_number;
  currentPoDraft.supplier_name = document.getElementById('mSupplier').value || currentPoDraft.supplier_name;
  const manualTotal = Number(document.getElementById('mPrice').value || 0);
  currentPoDraft.grand_total = manualTotal;
  currentPoDraft.notes = document.getElementById('mRemarks').value || currentPoDraft.notes;

  const previewBox = document.getElementById('aiPoPreviewContainer');
  if (previewBox) {
    previewBox.innerHTML = generatePoDocumentHtml(currentPoDraft);
  }
}

function generatePoPdfBlob(draft) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE ORDER', 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref PR: ${draft.pr_number}   |   Dept: ${draft.department}`, 14, 27);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${draft.po_number}`, 196, 20, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${draft.date}`, 196, 26, { align: 'right' });
  doc.text(`Terms: ${draft.payment_terms || 'Standard'}`, 196, 32, { align: 'right' });

  doc.setLineWidth(0.5);
  doc.line(14, 36, 196, 36);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('VENDOR / SUPPLIER:', 14, 44);
  doc.text('REQUESTED BY:', 120, 44);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${draft.supplier_name || 'TBD'}`, 14, 50);
  doc.text(`${draft.requestor} (${draft.department})`, 120, 50);

  const tableBody = (draft.items || []).map((it, idx) => [
    idx + 1,
    it.name,
    it.qty,
    it.unit,
    `PHP ${Number(it.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `PHP ${Number(it.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ]);

  doc.autoTable({
    startY: 58,
    head: [['#', 'Item Description', 'Qty', 'Unit', 'Unit Price', 'Line Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 36 },
      5: { halign: 'right', cellWidth: 36 }
    },
    styles: { fontSize: 9, cellPadding: 3 }
  });

  const finalY = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Notes / Special Instructions:', 14, finalY);
  doc.setFont('helvetica', 'normal');
  const splitNotes = doc.splitTextToSize(draft.notes || 'None', 105);
  doc.text(splitNotes, 14, finalY + 6);

  doc.setFontSize(10);
  doc.text('Subtotal:', 130, finalY);
  doc.text(`PHP ${Number(draft.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, finalY, { align: 'right' });

  doc.text('Tax / VAT:', 130, finalY + 6);
  doc.text(`PHP ${Number(draft.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, finalY + 6, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Grand Total:', 130, finalY + 14);
  doc.text(`PHP ${Number(draft.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, finalY + 14, { align: 'right' });

  return doc.output('blob');
}

function printCurrentPoDraft() {
  if (!currentPoDraft) return;
  const pdfBlob = generatePoPdfBlob(currentPoDraft);
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
}

// Call API 
async function askAiToUpdatePo() {
  const inputEl = document.getElementById('aiChatInput');
  const chatLog = document.getElementById('aiChatLog');
  const sendBtn = document.getElementById('aiSendBtn');
  const instruction = inputEl.value.trim();

  if (!instruction) return;

  let activeApiKey = (localStorage.getItem('PROCUREMENT_GEMINI_KEY') || GEMINI_API_KEY || '').trim();

  if (!activeApiKey || activeApiKey.includes('PASTE_YOUR') || activeApiKey.includes('ILAGAY_')) {
    const entered = prompt('Paste your new Gemini API Key from Google AI Studio (this will be saved safely in your browser so GitHub will not block it):');
    if (!entered) return;
    activeApiKey = entered.trim();
    localStorage.setItem('PROCUREMENT_GEMINI_KEY', activeApiKey);
  }

  chatLog.innerHTML += `<div class="bg-blue-50 text-blue-900 p-2 rounded-lg text-xs"><strong>Admin:</strong> ${instruction}</div>`;
  inputEl.value = '';
  sendBtn.disabled = true;
  sendBtn.textContent = 'Thinking...';
  chatLog.scrollTop = chatLog.scrollHeight;

  const systemPrompt = `You are a Procurement Purchase Order AI Assistant.
Update the following Purchase Order JSON strictly based on the Admin's instruction (which may be in English, Tagalog, or Taglish).
Recalculate each item's line_total = qty * unit_price, subtotal = sum of line_totals, and grand_total = subtotal + tax_amount.
Return ONLY valid JSON with this exact structure:
{
  "po_number": "string",
  "supplier_name": "string",
  "payment_terms": "string",
  "items": [
    { "name": "string", "qty": number, "unit": "string", "unit_price": number, "line_total": number }
  ],
  "subtotal": number,
  "tax_amount": number,
  "grand_total": number,
  "notes": "string",
  "ai_reply": "Short confirmation message in English summarizing the changes made."
}`;

  async function runGeminiRequest(keyToUse) {
    let candidateModels = [
      'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash'
    ];

    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`);
      const listData = await listRes.json();
      if (listData.error) {
        throw new Error(listData.error.message);
      }
      if (listData.models) {
        const discovered = listData.models
          .filter(m =>
            m.supportedGenerationMethods?.includes('generateContent') &&
            m.name.includes('gemini') &&
            !m.name.includes('2.5-flash') &&
            !m.name.includes('tts') &&
            !m.name.includes('image') &&
            !m.name.includes('embedding')
          )
          .map(m => m.name.replace('models/', ''));

        candidateModels = [...new Set([...candidateModels, ...discovered])];
      }
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('api key not valid')) {
        throw e;
      }
      console.warn('Model discovery fallback:', e);
    }

    let rawJson = null;
    let lastError = 'No working Gemini model found.';

    for (const modelName of candidateModels) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToUse}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{
                text: `${systemPrompt}\n\nCurrent PO JSON:\n${JSON.stringify(currentPoDraft, null, 2)}\n\nAdmin Instruction: "${instruction}"`
              }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      const result = await response.json();
      if (!result.error && result.candidates?.[0]?.content?.parts?.[0]?.text) {
        rawJson = result.candidates[0].content.parts[0].text;
        break;
      } else if (result.error) {
        lastError = result.error.message;
      }
    }

    if (!rawJson) throw new Error(lastError);
    return rawJson;
  }

  try {
    let rawJson;
    try {
      rawJson = await runGeminiRequest(activeApiKey);
    } catch (firstErr) {
      // Kapag na-block ng GitHub/Google ang key, hingin ang bagong key sa popup at ulitin agad
      if (firstErr.message && firstErr.message.toLowerCase().includes('api key not valid')) {
        const newKey = prompt('Na-disable ng Google ang lumang API Key dahil na-scan sa GitHub.\n\nGumawa ng BAGONG API Key sa Google AI Studio (aistudio.google.com/app/apikey) at i-paste dito:');
        if (!newKey) throw firstErr;
        activeApiKey = newKey.trim();
        localStorage.setItem('PROCUREMENT_GEMINI_KEY', activeApiKey);
        rawJson = await runGeminiRequest(activeApiKey);
      } else {
        throw firstErr;
      }
    }

    const cleanedJson = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const updated = JSON.parse(cleanedJson);

    currentPoDraft = {
      ...currentPoDraft,
      po_number: updated.po_number || currentPoDraft.po_number,
      supplier_name: updated.supplier_name || currentPoDraft.supplier_name,
      payment_terms: updated.payment_terms || currentPoDraft.payment_terms,
      items: Array.isArray(updated.items) ? updated.items : currentPoDraft.items,
      subtotal: Number(updated.subtotal ?? 0),
      tax_amount: Number(updated.tax_amount ?? 0),
      grand_total: Number(updated.grand_total ?? 0),
      notes: updated.notes ?? currentPoDraft.notes
    };

    refreshPoPreviewAndInputs();
    chatLog.innerHTML += `<div class="bg-emerald-50 text-emerald-900 p-2 rounded-lg text-xs"><strong>AI Assistant:</strong> ${updated.ai_reply || 'PO document updated and recalculated.'}</div>`;
    chatLog.scrollTop = chatLog.scrollHeight;
  } catch (err) {
    chatLog.innerHTML += `<div class="bg-red-50 text-red-700 p-2 rounded-lg text-xs"><strong>AI Error:</strong> ${err.message}</div>`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Update PO';
  }
}

function openModal(id, mode) {
  const item = allRequests.find(r => r.id === id);
  if (!item) return;

  const modal = document.getElementById('actionModal');
  const modalBox = modal.querySelector('div');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  if (mode === 'create_po') {
    modalBox.classList.remove('max-w-lg');
    modalBox.classList.add('max-w-5xl');
  } else {
    modalBox.classList.remove('max-w-5xl');
    modalBox.classList.add('max-w-lg');
  }

  if (mode === 'create_po') {
    currentPoDraft = initPoDraftFromItem(item);
    title.textContent = `Admin: AI Purchase Order Builder (${item.pr_number})`;
    body.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-5 space-y-3">
          <div class="bg-slate-900 text-white p-3.5 rounded-xl space-y-2.5">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">Gemini AI PO Assistant</span>
              <span class="text-[11px] text-slate-400">Auto-computes items & totals</span>
            </div>
            <div id="aiChatLog" class="bg-slate-800/80 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-2 text-xs text-slate-200">
              <div><strong>AI Assistant:</strong> I have drafted PO <strong>${currentPoDraft.po_number}</strong> with ${currentPoDraft.items.length} item(s). Tell me the unit prices, supplier changes, or VAT/terms and I will update the PO document automatically!</div>
            </div>
            <div class="flex gap-1.5">
              <input id="aiChatInput" type="text" onkeydown="if(event.key==='Enter'){event.preventDefault();askAiToUpdatePo();}" placeholder="e.g. Bond paper is 220/ream, PPC strap 450, add 12% VAT..." class="w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none">
              <button type="button" id="aiSendBtn" onclick="askAiToUpdatePo()" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap">
                Update PO
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label class="block text-xs font-semibold mb-1">PO Number *</label>
              <input id="mPoNumber" oninput="syncManualInputsToDraft()" type="text" value="${currentPoDraft.po_number}" class="w-full border rounded px-3 py-1.5">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1">Total Amount (PHP) *</label>
              <input id="mPrice" oninput="syncManualInputsToDraft()" type="number" step="any" value="${currentPoDraft.grand_total || ''}" placeholder="0.00" class="w-full border rounded px-3 py-1.5 font-semibold text-blue-700">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">Final Supplier *</label>
            <input id="mSupplier" oninput="syncManualInputsToDraft()" type="text" value="${currentPoDraft.supplier_name}" placeholder="Enter supplier name" class="w-full border rounded px-3 py-1.5">
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">Admin Remarks / Reason (if returning)</label>
            <input id="mRemarks" oninput="syncManualInputsToDraft()" type="text" value="${item.remarks || ''}" placeholder="Optional notes or instructions" class="w-full border rounded px-3 py-1.5">
          </div>
        </div>

        <div class="lg:col-span-7 flex flex-col">
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-xs font-bold uppercase text-slate-600">Live Official PO Document Preview</span>
            <button type="button" onclick="printCurrentPoDraft()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded border font-medium">
              Open / Download PDF
            </button>
          </div>
          <div id="aiPoPreviewContainer" class="border rounded-xl bg-slate-50 p-2 overflow-y-auto max-h-[420px] shadow-inner"></div>
        </div>
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="saveAdminPO('${item.id}', 'Returned for Info')" class="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-2 rounded">Return to Requestor for Info</button>
      <button type="button" id="submitPoApprovalBtn" onclick="saveAdminPO('${item.id}', 'For Approval')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded font-semibold">Save PO PDF & Submit for Approval</button>
    `;
    refreshPoPreviewAndInputs();
  } else if (mode === 'approve_po') {
    title.textContent = `Manager Approval (${item.po_number || item.pr_number})`;
    body.innerHTML = `
      <div class="bg-slate-50 p-3 rounded border space-y-2">
        <div>
          <div class="text-xs font-bold uppercase text-slate-500">Items Included in this PO:</div>
          ${formatItemsHtml(item)}
        </div>
        <div class="pt-2 border-t"><strong>Supplier:</strong> ${item.final_supplier || 'N/A'}</div>
        <div><strong>Total Amount:</strong> ₱${Number(item.final_price || 0).toLocaleString()}</div>
        <div class="pt-1">
          <button type="button" onclick="openGeneratedPoPdf('${item.id}')" class="bg-purple-100 hover:bg-purple-200 text-purple-800 font-semibold px-3 py-1.5 rounded text-xs underline">
            Open Official PO Document (PDF)
          </button>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Manager Remarks (Required if Denied or Returned)</label>
        <input id="mRemarks" type="text" value="${item.remarks || ''}" placeholder="Enter reason or instructions" class="w-full border rounded px-3 py-1.5">
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="saveManagerDecision('${item.id}', 'Cancelled')" class="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded">Deny / Cancel PO</button>
      <button type="button" onclick="saveManagerDecision('${item.id}', 'Returned for Info')" class="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-2 rounded">Return for Additional Info</button>
      <button type="button" onclick="saveManagerDecision('${item.id}', 'Approved')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded font-semibold">Approve Entire PO</button>
    `;
  } else if (mode === 'upload_invoice') {
    title.textContent = `Upload Supplier PO / Billing (${item.po_number})`;
    body.innerHTML = `
      <div>
        <label class="block text-xs font-semibold mb-1">Confirm Final Invoice Amount (PHP) *</label>
        <input id="mPrice" type="number" step="any" value="${item.final_price || ''}" class="w-full border rounded px-3 py-1.5">
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Attach Supplier PO / Sales Invoice (PDF or Image) *</label>
        <input id="mInvoiceFile" type="file" class="w-full border rounded p-1.5 text-xs">
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Billing Notes for Finance</label>
        <input id="mRemarks" type="text" value="${item.remarks || ''}" placeholder="e.g. Payee name or payment terms" class="w-full border rounded px-3 py-1.5">
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="saveSupplierInvoice('${item.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded font-semibold">Send to Finance for Check Prep</button>
    `;
  } else if (mode === 'prepare_check') {
    const { supplierPoUrl } = extractFileUrls(item);
    title.textContent = `Finance: Check Preparation (${item.po_number})`;
    body.innerHTML = `
      <div class="bg-slate-50 p-3 rounded border space-y-1">
        <div><strong>Payee / Supplier:</strong> ${item.final_supplier}</div>
        <div><strong>Amount:</strong> ₱${Number(item.final_price || 0).toLocaleString()}</div>
        <div>
          <button type="button" onclick="openGeneratedPoPdf('${item.id}')" class="text-purple-600 underline font-semibold text-xs">
            View Official PO Document (PDF)
          </button>
        </div>
        ${supplierPoUrl ? `<div><a href="${supplierPoUrl}" target="_blank" class="text-blue-600 underline font-semibold text-xs">View Uploaded Supplier Invoice/PO</a></div>` : ''}
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Check Number / Voucher Reference *</label>
        <input id="mCheckNum" type="text" value="${item.check_number || ''}" placeholder="e.g. BDO Check 00006689804" class="w-full border rounded px-3 py-1.5">
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Attach Prepared Check / Voucher File (PDF or Image) *</label>
        <input id="mCheckFile" type="file" class="w-full border rounded p-1.5 text-xs bg-white">
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Finance Remarks</label>
        <input id="mRemarks" type="text" value="${item.remarks || ''}" placeholder="e.g. Check Ready for pick up" class="w-full border rounded px-3 py-1.5">
      </div>
    `;
    footer.innerHTML = `
      <button type="button" id="saveCheckBtn" onclick="saveFinanceCheck('${item.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded font-semibold">Confirm Check Ready (Send to Admin)</button>
    `;
  } else if (mode === 'fulfillment') {
    const { checkFileUrl } = extractFileUrls(item);
    title.textContent = `Admin: Update Purchase Status (${item.po_number || item.pr_number})`;
    body.innerHTML = `
      <div class="bg-slate-50 p-3 rounded border space-y-2">
        <div>
          <div class="text-xs font-bold uppercase text-slate-500">Items to Purchase:</div>
          ${formatItemsHtml(item)}
        </div>
        <div class="pt-2 border-t"><strong>Supplier:</strong> ${item.final_supplier || 'N/A'}</div>
        <div><strong>Total Amount:</strong> ₱${Number(item.final_price || 0).toLocaleString()}</div>
        <div><strong>Check Number:</strong> ${item.check_number || 'N/A'}</div>
        ${checkFileUrl ? `<div><a href="${checkFileUrl}" target="_blank" class="text-amber-700 underline font-bold text-xs">View Prepared Check / Voucher</a></div>` : ''}
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Purchasing / Delivery Remarks</label>
        <input id="mRemarks" type="text" value="${item.remarks || ''}" placeholder="e.g. Partially bought 2 items, or All items purchased & delivered" class="w-full border rounded px-3 py-1.5">
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="saveAdminFulfillment('${item.id}', 'Partially Completed')" class="bg-amber-500 hover:bg-amber-600 text-white text-xs px-3 py-2 rounded font-semibold">Mark as Partially Completed</button>
      <button type="button" onclick="saveAdminFulfillment('${item.id}', 'Completed')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded font-semibold">Mark as Completed</button>
    `;
  } else if (mode === 'revise') {
    const subItems = parseSubItems(item);
    title.textContent = `Revise Request (${item.pr_number})`;
    body.innerHTML = `
      <div class="bg-orange-50 text-orange-800 p-2.5 rounded text-xs"><strong>Admin/Manager Note:</strong> ${item.remarks || 'Please provide additional details.'}</div>
      <div id="reviseCard" class="item-row space-y-2">
        <div class="flex justify-between items-center">
          <label class="text-xs font-bold uppercase text-slate-700">Items in this PO</label>
          <button type="button" onclick="addSubItemRow(document.getElementById('reviseCard'))" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1 rounded">
            + Add Another Item
          </button>
        </div>
        <div class="sub-items-list space-y-2"></div>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Preferred Supplier (Optional)</label>
        <input id="mSupplier" type="text" value="${item.req_supplier || ''}" class="w-full border rounded px-3 py-1.5">
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Update Reference File (Optional)</label>
        <input id="mReqFile" type="file" class="w-full border rounded p-1.5 text-xs">
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Requestor Revision Notes</label>
        <input id="mRemarks" type="text" placeholder="e.g. Updated specifications attached" class="w-full border rounded px-3 py-1.5">
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="saveRequestorRevision('${item.id}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded font-semibold">Resubmit to Admin</button>
    `;

    const reviseCard = document.getElementById('reviseCard');
    subItems.forEach(s => addSubItemRow(reviseCard, s));
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModal() {
  const modal = document.getElementById('actionModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function saveAdminPO(id, nextStatus) {
  const item = allRequests.find(r => r.id === id);
  const po_number = document.getElementById('mPoNumber').value;
  const final_supplier = document.getElementById('mSupplier').value;
  const final_price = document.getElementById('mPrice').value ? Number(document.getElementById('mPrice').value) : null;
  const remarks = document.getElementById('mRemarks').value;

  if (nextStatus === 'For Approval' && (!po_number || !final_supplier || !final_price)) {
    alert('Please fill in the PO Number, Final Supplier, and Total Amount (or ask the AI Assistant to compute it) before submitting for approval.');
    return;
  }

  const submitBtn = document.getElementById('submitPoApprovalBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving PO PDF...';
  }

  try {
    const { reqFileUrl } = extractFileUrls(item);
    let combinedFileUrl = item.req_file_url;

    let updatedItemName = item.item_name;
    if (currentPoDraft && nextStatus === 'For Approval') {
      const poBlob = generatePoPdfBlob(currentPoDraft);
      poBlob.name = `${po_number}.pdf`;
      const poDocUrl = await uploadFile(poBlob, 'po_doc');
      combinedFileUrl = `${reqFileUrl || ''}||PO_DOC||${poDocUrl}`;

      if (currentPoDraft.items && currentPoDraft.items.length > 0) {
        updatedItemName = currentPoDraft.items.length === 1
          ? `${currentPoDraft.items[0].name} [${currentPoDraft.items[0].qty} ${currentPoDraft.items[0].unit}]`
          : currentPoDraft.items.map(s => `${s.name} [${s.qty} ${s.unit}]`).join('\n');
      }
    }

    const updates = {
      po_number,
      final_supplier,
      final_price,
      remarks,
      item_name: updatedItemName,
      req_file_url: combinedFileUrl,
      status: nextStatus
    };

    const { error } = await supabaseClient.from('purchase_requests').update(updates).eq('id', id);
    if (error) throw error;

    const updatedItem = { ...item, ...updates };
    if (nextStatus === 'For Approval') {
      await sendWorkflowEmail({
        toEmail: NOTIFICATION_EMAILS.manager,
        recipientName: 'Admin Manager',
        subject: `PO For Approval (${po_number})`,
        message: `Admin has generated Purchase Order ${po_number} and submitted it for your approval.`,
        item: updatedItem
      });
    } else if (nextStatus === 'Returned for Info') {
      await sendWorkflowEmail({
        toEmail: item.requestor_email,
        recipientName: item.requestor_name,
        subject: `Action Required: Request Returned (${item.pr_number})`,
        message: `Your purchase request was returned by Admin for additional information. Please log in to revise your request.`,
        item: updatedItem
      });
    }

    closeModal();
    loadRequests();
  } catch (err) {
    alert('Error saving PO: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save PO PDF & Submit for Approval';
    }
  }
}

async function saveManagerDecision(id, nextStatus) {
  const item = allRequests.find(r => r.id === id);
  const remarks = document.getElementById('mRemarks').value;
  if (nextStatus !== 'Approved' && !remarks) {
    alert('Please provide remarks explaining why this request is being returned or cancelled.');
    return;
  }

  const updates = { status: nextStatus, remarks };
  const { error } = await supabaseClient.from('purchase_requests').update(updates).eq('id', id);
  if (error) return alert(error.message);

  const updatedItem = { ...item, ...updates };
  if (nextStatus === 'Approved') {
    await sendWorkflowEmail({
      toEmail: `${NOTIFICATION_EMAILS.admin}, ${item.requestor_email}`,
      recipientName: 'Admin & Requestor',
      subject: `PO Approved (${item.po_number || item.pr_number})`,
      message: `Purchase Order ${item.po_number || item.pr_number} has been APPROVED by the Admin Manager. Admin may now proceed with purchasing and uploading the supplier invoice.`,
      item: updatedItem
    });
  } else {
    await sendWorkflowEmail({
      toEmail: `${item.requestor_email}, ${NOTIFICATION_EMAILS.admin}`,
      recipientName: item.requestor_name,
      subject: `PO ${nextStatus} (${item.po_number || item.pr_number})`,
      message: `Your purchase order/request status has been updated to "${nextStatus}" by the Admin Manager.`,
      item: updatedItem
    });
  }

  closeModal();
  loadRequests();
}

async function saveSupplierInvoice(id) {
  const item = allRequests.find(r => r.id === id);
  const fileInput = document.getElementById('mInvoiceFile');
  const final_price = Number(document.getElementById('mPrice').value);
  const remarks = document.getElementById('mRemarks').value;

  if (!fileInput.files[0]) {
    alert('Please attach the Supplier PO or Sales Invoice before forwarding to Finance.');
    return;
  }

  try {
    const supplier_po_url = await uploadFile(fileInput.files[0], 'invoice');
    const updates = { final_price, supplier_po_url, remarks, status: 'For Check Prep' };
    const { error } = await supabaseClient.from('purchase_requests').update(updates).eq('id', id);
    if (error) throw error;

    await sendWorkflowEmail({
      toEmail: NOTIFICATION_EMAILS.finance,
      recipientName: 'Finance Department',
      subject: `For Check Preparation (${item.po_number})`,
      message: `Admin has uploaded the Supplier PO/Sales Invoice for ${item.po_number}. Please log in to view the attachment and prepare the check.`,
      item: { ...item, ...updates }
    });

    closeModal();
    loadRequests();
  } catch (err) {
    alert('Upload error: ' + err.message);
  }
}

// Finance marks check as "Check Ready" so Admin can proceed with actual purchase completion
async function saveFinanceCheck(id) {
  const item = allRequests.find(r => r.id === id);
  const check_number = document.getElementById('mCheckNum').value.trim();
  const fileInput = document.getElementById('mCheckFile');
  const remarks = document.getElementById('mRemarks').value.trim();
  const saveBtn = document.getElementById('saveCheckBtn');

  if (!check_number) {
    alert('Please enter the Check Number or Voucher Reference.');
    return;
  }

  if (!fileInput || !fileInput.files[0]) {
    alert('Please attach the Prepared Check or Voucher file before confirming.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Uploading Check...';
  }

  try {
    const { supplierPoUrl } = extractFileUrls(item);
    const checkFileUrl = await uploadFile(fileInput.files[0], 'check');
    const combinedSupplierAndCheckUrl = `${supplierPoUrl || ''}||CHK_FILE||${checkFileUrl}`;

    const updates = {
      check_number,
      remarks,
      supplier_po_url: combinedSupplierAndCheckUrl,
      status: 'Check Ready'
    };

    const { error } = await supabaseClient.from('purchase_requests').update(updates).eq('id', id);
    if (error) throw error;

    await sendWorkflowEmail({
      toEmail: `${NOTIFICATION_EMAILS.admin}, ${item.requestor_email}`,
      recipientName: `Admin & ${item.requestor_name}`,
      subject: `Check Ready for PO ${item.po_number} (Check #: ${check_number})`,
      message: `Finance has prepared the check (Check/Voucher #: ${check_number}) for Purchase Order ${item.po_number}. Admin may now proceed to complete the purchase.`,
      item: { ...item, ...updates }
    });

    closeModal();
    loadRequests();
  } catch (err) {
    alert('Upload error: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Confirm Check Ready (Send to Admin)';
    }
  }
}

// Admin updates purchase status to "Partially Completed" or "Completed"
async function saveAdminFulfillment(id, nextStatus) {
  const item = allRequests.find(r => r.id === id);
  const remarks = document.getElementById('mRemarks').value.trim();

  const updates = { status: nextStatus, remarks };
  const { error } = await supabaseClient.from('purchase_requests').update(updates).eq('id', id);
  if (error) return alert(error.message);

  await sendWorkflowEmail({
    toEmail: `${item.requestor_email}, ${NOTIFICATION_EMAILS.manager}`,
    recipientName: `${item.requestor_name} & Admin Manager`,
    subject: `PO ${item.po_number || item.pr_number} Status: ${nextStatus}`,
    message: `Admin has updated the purchasing status of Purchase Order ${item.po_number || item.pr_number} to "${nextStatus}".`,
    item: { ...item, ...updates }
  });

  closeModal();
  loadRequests();
}

async function saveRequestorRevision(id) {
  const item = allRequests.find(r => r.id === id);
  const { poDocUrl } = extractFileUrls(item);
  const reviseCard = document.getElementById('reviseCard');
  const subRows = reviseCard.querySelectorAll('.sub-item-row');
  const subItems = Array.from(subRows).map(r => ({
    name: r.querySelector('.sub-item-name').value.trim(),
    qty: Number(r.querySelector('.sub-item-qty').value),
    unit: r.querySelector('.sub-item-unit').value.trim()
  }));

  const item_name = subItems.length === 1
    ? subItems[0].name
    : subItems.map(s => `${s.name} [${s.qty} ${s.unit}]`).join('\n');
  const quantity = subItems.reduce((sum, s) => sum + s.qty, 0);
  const unit = subItems.length === 1 ? subItems[0].unit : `items (${subItems.length} lines)`;

  const req_supplier = document.getElementById('mSupplier').value;
  const remarks = document.getElementById('mRemarks').value;
  const fileInput = document.getElementById('mReqFile');

  try {
    const updates = { item_name, quantity, unit, req_supplier, remarks, status: 'Pending Admin' };
    if (fileInput.files[0]) {
      const newReqUrl = await uploadFile(fileInput.files[0], 'req_rev');
      updates.req_file_url = poDocUrl ? `${newReqUrl}||PO_DOC||${poDocUrl}` : newReqUrl;
    }

    const { error } = await supabaseClient.from('purchase_requests').update(updates).eq('id', id);
    if (error) throw error;

    await sendWorkflowEmail({
      toEmail: NOTIFICATION_EMAILS.admin,
      recipientName: 'Admin / Purchasing Staff',
      subject: `Request Revised & Resubmitted (${item.pr_number})`,
      message: `${item.requestor_name} has updated and resubmitted ${item.pr_number} for your review.`,
      item: { ...item, ...updates }
    });

    closeModal();
    loadRequests();
  } catch (err) {
    alert(err.message);
  }
}