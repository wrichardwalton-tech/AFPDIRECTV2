const { fetchPaidMembersForExport } = require("./lib/enroll-save");
const { membersToCsv } = require("./lib/sedera-csv");
const { sendCsvEmail } = require("./lib/email");

exports.handler = async (event) => {
  const key = event.headers["x-export-key"] || event.queryStringParameters?.key;
  if (!process.env.EXPORT_SECRET || key !== process.env.EXPORT_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }
  try {
    const rows = await fetchPaidMembersForExport();
    const csv = membersToCsv(rows);
    const group = process.env.SEDERA_GROUP_ID || "GROUP";
    const d = new Date();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const filename = `${group}_EnrollmentFile_${mm}${dd}${yyyy}.csv`;
    await sendCsvEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Sedera enrollment export (manual) — ${rows.length} row(s)`,
      csv,
      filename,
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true, rows: rows.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
