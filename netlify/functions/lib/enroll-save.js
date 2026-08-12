const {
  getDb,
  ensureSchema,
  benefitTier,
  newHouseholdId,
  newEnrollmentId,
} = require("./db");

async function savePendingEnrollment(payload, { stripeSessionId } = {}) {
  const db = getDb();
  await ensureSchema();

  const id = newEnrollmentId();
  const householdId = newHouseholdId();
  const groupId = process.env.SEDERA_GROUP_ID || "";
  const dpc = process.env.DPC_PROVIDER_NAME || "Amarillo Family Physicians";
  const now = new Date().toISOString();
  const tier = benefitTier(payload.household);
  const pricingTier = payload.ageBand || "None";
  const iua = Number(payload.iua) || 0;
  const startDate = payload.startDate || "";

  await db.execute({
    sql: `INSERT INTO enrollments (
      id, status, stripe_session_id, stripe_customer_email,
      household_type, age_band, iua, tobacco_household, tobacco_surcharge,
      afp_portion, sedera_portion, total, start_date, how_heard, notes, newsletter,
      group_id, household_id, created_at, updated_at, raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id,
      "pending",
      stripeSessionId || null,
      normalizeEmail(payload.email) || null,
      payload.household || null,
      payload.ageBand || null,
      iua,
      payload.tobaccoHousehold ? 1 : 0,
      Number(payload.tobaccoSurcharge) || 0,
      Number(payload.afpPortion) || null,
      Number(payload.sederaPortion) || null,
      Number(payload.total) || null,
      startDate,
      payload.howHeard || null,
      payload.notes || null,
      payload.newsletter ? 1 : 0,
      groupId,
      householdId,
      now,
      now,
      JSON.stringify(payload),
    ],
  });

  await insertMember(db, {
    enrollment_id: id,
    household_id: householdId,
    group_id: groupId,
    first_name: payload.firstName,
    middle_initial: "",
    last_name: payload.lastName,
    dob: payload.dob,
    gender: normalizeGender(payload.gender),
    phone: normalizePhone(payload.phone),
    email: normalizeEmail(payload.email),
    address1: payload.address1,
    address2: payload.address2 || "",
    city: payload.city,
    state: payload.state,
    zipcode: normalizeZip(payload.zip),
    relationship: "Primary",
    smoker: payload.smoker === "Yes" ? "Yes" : "No",
    iua,
    benefit_tier: tier,
    pricing_tier: pricingTier,
    mec_name: "",
    dpc_vpc_provider: dpc,
    telemedicine: "",
    start_date: startDate,
  });

  const deps = Array.isArray(payload.dependents) ? payload.dependents : [];
  for (const d of deps) {
    const rel = d.relationship === "Spouse" ? "Spouse" : "Child";
    await insertMember(db, {
      enrollment_id: id,
      household_id: householdId,
      group_id: groupId,
      first_name: d.firstName || "",
      middle_initial: "",
      last_name: d.lastName || "",
      dob: d.dob || "",
      gender: normalizeGender(d.gender),
      phone: "",
      email: "",
      address1: payload.address1 || "",
      address2: "",
      city: payload.city || "",
      state: payload.state || "",
      zipcode: payload.zip || "",
      relationship: rel,
      smoker: d.smoker === "Yes" ? "Yes" : "No",
      iua,
      benefit_tier: tier,
      pricing_tier: pricingTier,
      mec_name: "",
      dpc_vpc_provider: dpc,
      telemedicine: "",
      start_date: startDate,
    });
  }

  return { id, householdId, groupId };
}

async function insertMember(db, m) {
  await db.execute({
    sql: `INSERT INTO members (
      enrollment_id, household_id, group_id, first_name, middle_initial, last_name,
      dob, gender, phone, email, address1, address2, city, state, zipcode,
      relationship, smoker, iua, benefit_tier, pricing_tier, mec_name,
      dpc_vpc_provider, telemedicine, start_date
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      m.enrollment_id,
      m.household_id,
      m.group_id,
      m.first_name,
      m.middle_initial || "",
      m.last_name,
      m.dob || "",
      m.gender || "",
      m.phone || "",
      m.email || "",
      m.address1 || "",
      m.address2 || "",
      m.city || "",
      m.state || "",
      m.zipcode || "",
      m.relationship,
      m.smoker || "No",
      m.iua ?? null,
      m.benefit_tier || "",
      m.pricing_tier || "None",
      m.mec_name || "",
      m.dpc_vpc_provider || "",
      m.telemedicine || "",
      m.start_date || "",
    ],
  });
}


function normalizePhone(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}
function normalizeZip(value) {
  const d = String(value || "").replace(/\D/g, "").slice(0, 9);
  if (d.length === 9) return d.slice(0, 5) + "-" + d.slice(5);
  return d.slice(0, 5);
}
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGender(g) {
  if (!g) return "";
  const s = String(g).toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return String(g).slice(0, 1).toUpperCase();
}

async function markEnrollmentPaid({ enrollmentId, stripeSessionId, email }) {
  const db = getDb();
  await ensureSchema();
  const now = new Date().toISOString();

  if (enrollmentId) {
    await db.execute({
      sql: `UPDATE enrollments SET status=?, stripe_session_id=COALESCE(?, stripe_session_id),
            stripe_customer_email=COALESCE(?, stripe_customer_email), paid_at=?, updated_at=?
            WHERE id=?`,
      args: ["paid", stripeSessionId || null, email || null, now, now, enrollmentId],
    });
    return enrollmentId;
  }

  if (stripeSessionId) {
    await db.execute({
      sql: `UPDATE enrollments SET status=?, paid_at=?, updated_at=?,
            stripe_customer_email=COALESCE(?, stripe_customer_email)
            WHERE stripe_session_id=?`,
      args: ["paid", now, now, email || null, stripeSessionId],
    });
  }
  return enrollmentId || null;
}

async function attachStripeSession(enrollmentId, stripeSessionId) {
  const db = getDb();
  await db.execute({
    sql: `UPDATE enrollments SET stripe_session_id=?, updated_at=? WHERE id=?`,
    args: [stripeSessionId, new Date().toISOString(), enrollmentId],
  });
}

async function fetchPaidMembersForExport() {
  const db = getDb();
  await ensureSchema();
  const rs = await db.execute({
    sql: `SELECT m.* FROM members m
          INNER JOIN enrollments e ON e.id = m.enrollment_id
          WHERE e.status = 'paid'
          ORDER BY e.paid_at ASC, m.id ASC`,
    args: [],
  });
  return rs.rows;
}

module.exports = {
  savePendingEnrollment,
  markEnrollmentPaid,
  attachStripeSession,
  fetchPaidMembersForExport,
};
