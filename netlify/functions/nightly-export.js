const { fetchPaidMembersForExport } = require("./lib/enroll-save");
const { membersToCsv } = require("./lib/sedera-csv");
const { sendCsvEmail } = require("./lib/email");

exports.handler = async () => {
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
      subject: `Sedera enrollment export — ${rows.length} member row(s) — ${mm}/${dd}/${yyyy}`,
      csv,
      filename,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, rows: rows.length, filename }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
