import { Handler } from "@netlify/functions";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

// CONFIGURATION
// In a real app, set these in your Netlify Dashboard > Site settings > Environment variables
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_USER = process.env.SMTP_USER || ""; // Your email
const SMTP_PASS = process.env.SMTP_PASS || ""; // Your app password
const JWT_SECRET = process.env.JWT_SECRET || "smartgrade-dev-secret-key-change-me";

const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email } = JSON.parse(event.body || "{}");

    if (!email || !email.includes("@")) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid email" }) };
    }

    // 1. Generate 6-digit Code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Send Email (Mock or Real)
    if (SMTP_USER && SMTP_PASS) {
      // Real Email Sending
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: 465,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });

      await transporter.sendMail({
        from: `"SmartGrade AI" <${SMTP_USER}>`,
        to: email,
        subject: "Your Verification Code",
        text: `Your SmartGrade verification code is: ${code}`,
        html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2>Welcome to SmartGrade AI</h2>
                <p>Your verification code is:</p>
                <h1 style="color: #4F46E5; letter-spacing: 5px;">${code}</h1>
                <p>This code expires in 10 minutes.</p>
               </div>`,
      });
      console.log(`Email sent to ${email}`);
    } else {
      // Development Fallback (Logs to Netlify Function console)
      console.log("------------------------------------------------");
      console.log(`[DEV MODE] Email Verification for: ${email}`);
      console.log(`[DEV MODE] Code: ${code}`);
      console.log("------------------------------------------------");
    }

    // 3. Create a Signed Token (Stateless Verification)
    // We put the code inside the token so we can verify it later without a database.
    const token = jwt.sign({ email, code }, JWT_SECRET, { expiresIn: "10m" });

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Code sent", 
        devMode: !SMTP_USER, // Frontend can use this to show a hint if needed
        previewCode: !SMTP_USER ? code : null, // Send code to frontend ONLY in dev mode
        token: token 
      }),
    };

  } catch (error: any) {
    console.error("Function error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

export { handler };