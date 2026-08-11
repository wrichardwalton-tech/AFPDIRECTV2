/** Sedera file-based enrollment CSV (matches GroupID example headers) */
const HEADERS = [
  "Group ID",
  "Household ID",
  "First Name",
  "Middle Initial",
  "Last Name",
  "DOB",
  "Gender",
  "Phone Number",
  "Email",
  "Address 1 ",
  "Address 2 ",
  "City",
  "State",
  "Zipcode",
  "Relationship",
  "Smoker",
  "IUA",
  "Benefit Tier",
  "Pricing Tier",
  "MEC Name",
  "DPC/VPC Provider",
  "Telemedicine",
  "Start Date",
];

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDob(dob) {
  if (!dob) return "";
  // expect YYYY-MM-DD → M/D/YYYY for readability; Sedera accepts date values
  const m = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return String(dob);
}

function membersToCsv(rows) {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.group_id,
        r.household_id,
        r.first_name,
        r.middle_initial || "",
        r.last_name,
        formatDob(r.dob),
        r.gender || "",
        r.phone || "",
        r.email || "",
        r.address1 || "",
        r.address2 || "",
        r.city || "",
        r.state || "",
        r.zipcode || "",
        r.relationship || "",
        r.smoker || "No",
        r.iua ?? "",
        r.benefit_tier || "",
        r.pricing_tier || "None",
        r.mec_name || "",
        r.dpc_vpc_provider || "",
        r.telemedicine || "",
        formatDob(r.start_date) || r.start_date || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

module.exports = { HEADERS, membersToCsv, formatDob };
