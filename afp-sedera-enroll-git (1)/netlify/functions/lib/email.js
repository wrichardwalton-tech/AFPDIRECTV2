async function sendCsvEmail({ to, subject, csv, filename }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || "AFP Direct Enroll <onboarding@resend.dev>";
  if (!key) throw new Error("RESEND_API_KEY is not set");
  if (!to) throw new Error("ADMIN_EMAIL is not set");

  const b64 = Buffer.from(csv, "utf8").toString("base64");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: "Attached: Sedera enrollment CSV export (paid members).\n\nGenerated automatically from AFP Direct enrollment.",
      attachments: [
        {
          filename: filename || "Sedera_Enrollment_Export.csv",
          content: b64,
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && data.message) || `Resend error ${res.status}`);
  }
  return data;
}

module.exports = { sendCsvEmail };
