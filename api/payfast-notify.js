// api/payfast-notify.js
// Vercel serverless function - PayFast ITN (Instant Transaction Notification)
// PayFast calls this URL after every payment to confirm subscription

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service role key - bypasses RLS
)

// PayFast passphrase - set this in Vercel environment variables
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || ""
const IS_SANDBOX = process.env.PAYFAST_SANDBOX === "true"

function generateSignature(data, passphrase) {
  // Build param string
  let pfOutput = ""
  for (const key in data) {
    if (data[key] !== "" && key !== "signature") {
      pfOutput += `${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, "+")}&`
    }
  }
  // Remove last &
  let getString = pfOutput.slice(0, -1)
  if (passphrase) {
    getString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
  }
  return crypto.createHash("md5").update(getString).digest("hex")
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const data = req.body

    // 1. Verify signature
    const receivedSignature = data.signature
    const expectedSignature = generateSignature(data, PAYFAST_PASSPHRASE)
    if (receivedSignature !== expectedSignature) {
      console.error("PayFast signature mismatch", { received: receivedSignature, expected: expectedSignature })
      return res.status(400).send("Invalid signature")
    }

    // 2. Verify payment status
    if (data.payment_status !== "COMPLETE") {
      console.log("Payment not complete:", data.payment_status)
      return res.status(200).send("OK") // Still return 200 to acknowledge
    }

    // 3. Extract business info from custom fields
    const businessId  = data.custom_str1
    const planId      = data.custom_str2 // "pro" or "pro_y"
    const amountPaid  = parseFloat(data.amount_gross || 0)

    if (!businessId) {
      console.error("No business ID in payment notification")
      return res.status(400).send("Missing business ID")
    }

    // 4. Determine plan and expiry
    const isYearly = planId === "pro_y" || amountPaid >= 4990
    const expiryDate = new Date()
    if (isYearly) {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1)
    }

    // 5. Update business plan in Supabase
    const { error: updateError } = await supabase
      .from("bb_businesses")
      .update({
        plan_id:         "pro",
        trial_ends_at:   expiryDate.toISOString(),
        payfast_token:   data.token || null,
        last_payment_at: new Date().toISOString(),
        last_payment_amt: amountPaid,
      })
      .eq("id", businessId)

    if (updateError) {
      console.error("Failed to update business plan:", updateError)
      return res.status(500).send("Database error")
    }

    // 6. Log the transaction
    await supabase.from("bb_subscriptions").insert({
      business_id:   businessId,
      plan_id:       "pro",
      amount:        amountPaid,
      period:        isYearly ? "yearly" : "monthly",
      payfast_token: data.token || null,
      payment_id:    data.pf_payment_id,
      status:        "active",
      starts_at:     new Date().toISOString(),
      ends_at:       expiryDate.toISOString(),
    })

    console.log(`✓ Plan upgraded to PRO for business ${businessId} until ${expiryDate.toISOString()}`)
    return res.status(200).send("OK")

  } catch (err) {
    console.error("PayFast webhook error:", err)
    return res.status(500).send("Server error")
  }
}
