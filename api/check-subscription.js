// api/check-subscription.js
// Called on app load to verify subscription status is current

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed")

  const { businessId } = req.body
  if (!businessId) return res.status(400).json({ error: "Missing businessId" })

  try {
    // Get business
    const { data: business } = await supabase
      .from("bb_businesses")
      .select("id, plan_id, trial_ends_at, last_payment_at")
      .eq("id", businessId)
      .single()

    if (!business) return res.status(404).json({ error: "Business not found" })

    const now = new Date()
    const trialEnd = business.trial_ends_at ? new Date(business.trial_ends_at) : null

    // Check if trial/subscription has expired
    if (business.plan_id === "pro" && trialEnd && trialEnd < now) {
      // Check if there's an active subscription
      const { data: sub } = await supabase
        .from("bb_subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .eq("status", "active")
        .gte("ends_at", now.toISOString())
        .single()

      if (!sub) {
        // Subscription expired — downgrade to free
        await supabase
          .from("bb_businesses")
          .update({ plan_id: "free" })
          .eq("id", businessId)

        return res.status(200).json({ plan: "free", expired: true })
      }
    }

    return res.status(200).json({
      plan: business.plan_id,
      trialEnds: business.trial_ends_at,
      active: true
    })
  } catch (err) {
    console.error("Subscription check error:", err)
    return res.status(500).json({ error: "Server error" })
  }
}
