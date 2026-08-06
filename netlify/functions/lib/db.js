const { createClient } = require("@libsql/client");

function getDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
  }
  return createClient({ url, authToken });
}

async function ensureSchema(db) {
  await db.batch(
    [
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
        start_date TEXT,
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status)`,
      `CREATE INDEX IF NOT EXISTS idx_members_enrollment ON members(enrollment_id)`,
      `CREATE INDEX IF NOT EXISTS idx_enrollments_stripe ON enrollments(stripe_session_id)`,
    ],
    "write"
  );
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

module.exports = {
  getDb,
  ensureSchema,
  benefitTier,
  newHouseholdId,
  newEnrollmentId,
};
