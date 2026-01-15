/**************************************************************
 AAMU R.E.D. Guest Log (static web app)
 - Data stored in browser localStorage (works offline on iPad)
 - Records can be exported to CSV
 - Auto sign-out after 8 hours
 - Auto return to Home after successful Sign In / Sign Out
**************************************************************/

const STORAGE_KEY = "aamu_red_guest_log_v1";
const AUTO_SIGNOUT_HOURS = 8;

// ---------- Helpers ----------
function nowISO() {
  return new Date().toISOString();
}

function formatLocal(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function normalizeName(full) {
  return full.trim().toLowerCase().split(/\s+/).join(" ");
}

function makeNameKey(first, last) {
  return normalizeName(`${first} ${last}`);
}

function loadLog() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveLog(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function ensureAutoSignOut() {
  const records = loadLog();
  const now = Date.now();
  let changed = false;

  for (const r of records) {
    if (r.signOutAt) continue;

    const signInMs = new Date(r.signInAt).getTime();
    const deadlineMs = signInMs + AUTO_SIGNOUT_HOURS * 60 * 60 * 1000;

    if (now >= deadlineMs) {
      r.signOutAt = new Date(deadlineMs).toISOString();
      r.autoSignedOut = true;
      changed = true;
    }
  }

  if (changed) saveLog(records);
}

function findActiveByNameKey(nameKey) {
  const records = loadLog();
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (!r.signOutAt && r.nameKey === nameKey) {
      return { records, index: i };
    }
  }
  return null;
}

function toCSV(records) {
  const header = [
    "first_name",
    "last_name",
    "agency_institution",
    "reason",
    "other_details",
    "sign_in",
    "sign_out",
    "auto_signed_out"
  ];

  const escapeCSV = (v) => {
    const s = (v ?? "").toString();
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [header.join(",")];

  for (const r of records) {
    lines.push([
      escapeCSV(r.firstName),
      escapeCSV(r.lastName),
      escapeCSV(r.agency),
      escapeCSV(r.reason),
      escapeCSV(r.otherDetails || ""),
      escapeCSV(r.signInAt),
      escapeCSV(r.signOutAt || ""),
      escapeCSV(r.autoSignedOut ? "YES" : "NO")
    ].join(","));
  }

  return lines.join("\n");
}

function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function goHomeAfterDelay(ms = 2000) {
  setTimeout(() => {
    window.location.href = "index.html";
  }, ms);
}

function showAlert(el, msg, type) {
  el.className = `alert ${type === "ok" ? "ok" : "err"}`;
  el.textContent = msg;
  el.style.display = "block";
}

// ---------- Page Init Hooks ----------
function initHome() {
  ensureAutoSignOut();
}

function initSignIn() {
  ensureAutoSignOut();

  const form = document.getElementById("signInForm");
  const reason = document.getElementById("reason");
  const otherWrap = document.getElementById("otherWrap");
  const alertBox = document.getElementById("alert");

  const toggleOther = () => {
    otherWrap.style.display = reason.value === "Other" ? "block" : "none";
  };
  reason.addEventListener("change", toggleOther);
  toggleOther();

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const firstName = document.getElementById("firstName").value.trim();
    const lastName  = document.getElementById("lastName").value.trim();
    const agency    = document.getElementById("agency").value.trim();
    const reasonVal = reason.value;
    const otherDetails = document.getElementById("otherDetails").value.trim();

    if (!firstName || !lastName || !agency) {
      showAlert(alertBox, "Please enter first name, last name, and agency/institution.", "err");
      return;
    }

    if (reasonVal === "Other" && !otherDetails) {
      showAlert(alertBox, "Please specify details for 'Other'.", "err");
      return;
    }

    const records = loadLog();

    const record = {
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      firstName,
      lastName,
      agency,
      reason: reasonVal,
      otherDetails: reasonVal === "Other" ? otherDetails : "",
      signInAt: nowISO(),
      signOutAt: "",
      autoSignedOut: false,
      nameKey: makeNameKey(firstName, lastName)
    };

    records.push(record);
    saveLog(records);

    showAlert(alertBox, "Signed in successfully. Returning to home screen...", "ok");

    form.reset();
    reason.value = "Meeting";
    document.getElementById("otherDetails").value = "";
    otherWrap.style.display = "none";

    goHomeAfterDelay(2000);
  });
}

function initSignOut() {
  ensureAutoSignOut();

  const form = document.getElementById("signOutForm");
  const alertBox = document.getElementById("alert");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    ensureAutoSignOut();

    const fullName = document.getElementById("fullName").value;
    const nameKey = normalizeName(fullName);

    if (!nameKey) {
      showAlert(alertBox, "Please type your first and last name.", "err");
      return;
    }

    const found = findActiveByNameKey(nameKey);

    if (!found) {
      showAlert(alertBox, "Name not recognized. Please check spelling or ask staff for help.", "err");
      return;
    }

    const { records, index } = found;
    records[index].signOutAt = nowISO();
    records[index].autoSignedOut = false;
    saveLog(records);

    showAlert(alertBox, "Signed out successfully. Returning to home screen...", "ok");

    form.reset();
    goHomeAfterDelay(2000);
  });
}

function initRecords() {
  ensureAutoSignOut();

  const search = document.getElementById("search");
  const tbody = document.getElementById("tbody");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");
  const countEl = document.getElementById("count");

  const render = () => {
    ensureAutoSignOut();
    const q = search.value.trim().toLowerCase();
    const records = loadLog();
    const ordered = [...records].reverse();

    const filtered = q
      ? ordered.filter(r => {
          const hay = `${r.firstName} ${r.lastName} ${r.agency} ${r.reason} ${r.otherDetails}`.toLowerCase();
          return hay.includes(q);
        })
      : ordered;

    tbody.innerHTML = "";
    for (const r of filtered) {
      const tr = document.createElement("tr");

      const name = `${r.firstName} ${r.lastName}`;
      const reason = r.reason === "Other" ? `Other: ${r.otherDetails}` : r.reason;
      const autoBadge = r.autoSignedOut ? `<span class="badge auto">AUTO</span>` : "";

      tr.innerHTML = `
        <td>${name}</td>
        <td>${r.agency}</td>
        <td>${reason}</td>
        <td>${formatLocal(r.signInAt)}</td>
        <td>${formatLocal(r.signOutAt)}</td>
        <td>${autoBadge}</td>
      `;
      tbody.appendChild(tr);
    }

    countEl.textContent = `${filtered.length} record(s) shown`;
  };

  search.addEventListener("input", render);

  exportBtn.addEventListener("click", () => {
    const records = loadLog();
    const csv = toCSV(records);
    const filename = `AAMU_RED_GuestLog_${new Date().toISOString().slice(0,10)}.csv`;
    downloadCSV(filename, csv);
  });

  clearBtn.addEventListener("click", () => {
    const ok = confirm("This will delete ALL records on this device/browser. Continue?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  render();
}

window.AAMU_APP = {
  initHome,
  initSignIn,
  initSignOut,
  initRecords
};
