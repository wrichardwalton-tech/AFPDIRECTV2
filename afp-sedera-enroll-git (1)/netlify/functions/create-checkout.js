const { savePendingEnrollment, attachStripeSession } = require("./lib/enroll-save");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "STRIPE_SECRET_KEY is not set in Netlify env (Production)" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const total = Number(payload.total);
  if (!Number.isFinite(total) || total < 1) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid total" }) };
  }
  if (!payload.email || !payload.firstName || !payload.lastName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required member fields" }) };
  }

  // Persist full application (pending). CSV export only includes paid.
  let enrollmentId = null;
  try {
    const saved = await savePendingEnrollment(payload);
    enrollmentId = saved.id;
  } catch (err) {
    console.error("DB save failed", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Could not save enrollment: " + (err.message || "db error"),
      }),
    };
  }

  const origin =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "https://creative-kashata-064625.netlify.app";
  const unitAmount = Math.round(total * 100);

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("customer_email", payload.email);
  params.append("client_reference_id", enrollmentId);
  params.append("success_url", `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${origin}/index.html?checkout=cancel`);
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.append("line_items[0][price_data][recurring][interval]", "month");
  params.append("line_items[0][price_data][product_data][name]", "AFP Direct + Sedera Membership");
  params.append(
    "line_items[0][price_data][product_data][description]",
    `${payload.household || "membership"} · IUA $${payload.iua || "—"} · start ${payload.startDate || "TBD"}`
  );
  params.append("metadata[enrollment_id]", enrollmentId);
  params.append("subscription_data[metadata][enrollment_id]", enrollmentId);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Stripe API error", data);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: (data && data.error && data.error.message) || "Stripe error",
        }),
      };
    }
    if (data.id && enrollmentId) {
      try {
        await attachStripeSession(enrollmentId, data.id);
      } catch (e) {
        console.error("attachStripeSession", e);
      }
    }
    if (!data.url) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Stripe did not return a checkout URL" }),
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: data.url, id: data.id, enrollmentId }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Checkout failed" }),
    };
  }
};
