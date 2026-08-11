/**
 * Turso via HTTP only (no native @libsql bindings — works on Netlify Functions).
 * API: https://docs.turso.tech/sdk/http/reference
 */

function config() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
  }
  // libsql://xxx → https://xxx
  const httpUrl = url.replace(/^libsql:\/\//, "https://");
  return { httpUrl, authToken };
}

function argValue(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: v };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

async function pipeline(requests) {
  const { httpUrl, authToken } = config();
  const res = await fetch(`${httpUrl}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data && data.error) ||
      (data && data.message) ||
      `Turso HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  // surface statement errors
  if (data.results) {
    for (const r of data.results) {
      if (r.type === "error" || r.error) {
        throw new Error(
          (r.error && (r.error.message || JSON.stringify(r.error))) ||
            "Turso statement error"
        );
      }
    }
  }
  return data;
}

async function execute(sql, args = []) {
  const data = await pipeline([
    {
      type: "execute",
      stmt: {
        sql,
        args: args.map(argValue),
      },
    },
    { type: "close" },
  ]);
  const result = (data.results && data.results[0] && data.results[0].response) || {};
  const result2 = result.result || result;
  const cols = (result2.cols || []).map((c) => c.name || c);
  const rowsRaw = result2.rows || [];
  const rows = rowsRaw.map((row) => {
    const obj = {};
    row.forEach((cell, i) => {
      const name = cols[i];
      let val = cell;
      if (cell && typeof cell === "object") {
        if ("value" in cell) val = cell.value;
        else if (cell.type === "null") val = null;
      }
      obj[name] = val;
    });
    return obj;
  });
  return { rows, cols };
}

async function batch(sqlStatements) {
  // sqlStatements: array of SQL strings (no args) for schema
  const requests = sqlStatements.map((sql) => ({
    type: "execute",
    stmt: { sql },
  }));
  requests.push({ type: "close" });
  await pipeline(requests);
}

async function ensureSchema() {
  await batch([
    `CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id TEXT,
      stripe_customer_email TEXT,
      household_type TEXT,
      age_band TEXT,
      iua INTEGER,
      tobacco_household INTEGER DEFAULT 0,
      tobacco_surcharge REAL DEFAULT 0,
      afp_portion REAL,
      sedera_portion REAL,
      total REAL,
      start_date TEXT,
      how_heard TEXT,
      notes TEXT,
      newsletter INTEGER DEFAULT 0,
      group_id TEXT,
      household_id TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      raw_json TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id TEXT NOT NULL,
      household_id TEXT NOT NULL,
      group_id TEXT,
      first_name TEXT NOT NULL,
      middle_initial TEXT,
      last_name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      phone TEXT,
      email TEXT,
      address1 TEXT,
      address2 TEXT,
      city TEXT,
      state TEXT,
      zipcode TEXT,
      relationship TEXT NOT NULL,
      smoker TEXT,
      iua INTEGER,
      benefit_tier TEXT,
      pricing_tier TEXT,
      mec_name TEXT,
      dpc_vpc_provider TEXT,
      telemedicine TEXT,
      start_date TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status)`,
    `CREATE INDEX IF NOT EXISTS idx_members_enrollment ON members(enrollment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_stripe ON enrollments(stripe_session_id)`,
  ]);
}

function benefitTier(household) {
  const map = {
    memberOnly: "EO",
    memberSpouse: "ES",
    memberChild: "EC",
    memberFamily: "EF",
  };
  return map[household] || "EO";
}

function newHouseholdId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AFP${t}${r}`.replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

function newEnrollmentId() {
  return `enr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Compatibility shim so enroll-save can call getDb().execute / ensureSchema */
function getDb() {
  return {
    execute: async ({ sql, args }) => execute(sql, args || []),
    batch: async (stmts) =>
      batch(
        stmts.map((s) => (typeof s === "string" ? s : s))
      ),
  };
}

module.exports = {
  getDb,
  ensureSchema,
  execute,
  batch,
  benefitTier,
  newHouseholdId,
  newEnrollmentId,
};
