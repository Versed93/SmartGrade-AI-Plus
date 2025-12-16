import { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "smartgrade-dev-secret-key-change-me";

const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email, code, token } = JSON.parse(event.body || "{}");

    if (!token || !code) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing code or token" }) };
    }

    // 1. Verify and Decode the Token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return { statusCode: 401, body: JSON.stringify({ error: "Code expired or invalid" }) };
    }

    // 2. Validate content
    if (decoded.email !== email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email mismatch" }) };
    }

    if (decoded.code !== code) {
      return { statusCode: 400, body: JSON.stringify({ error: "Incorrect code" }) };
    }

    // 3. Success
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };

  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

export { handler };