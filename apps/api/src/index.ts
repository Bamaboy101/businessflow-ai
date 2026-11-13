import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono<{ Bindings: { DB?: D1Database } }>()

app.use('*', cors())
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`)
})

async function parseBody(c: any): Promise<any> {
  try {
    const body = await c.req.raw.json()
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return body
    }
    return {}
  } catch (e) {
    return {}
  }
}

type Inquiry = { id: string; received_utc: string; text: string; category: string; urgency: string; state: string }
type Draft = { id: string; inquiry_id: string; answer: string; citations: string; unsupported_claims: number; created_utc: string }
type Decision = { id: string; inquiry_id: string; actor: string; approved: boolean; reason: string | null; decided_utc: string }
type SandboxActivity = { id: string; inquiry_id: string; activity: string; created_utc: string }
type Policy = { source_id: string; revision: string; topic: string; approved_text: string }

const POLICIES: Policy[] = [
  { source_id: 'pol-refund-1', revision: '1.0', topic: 'refunds', approved_text: 'Refunds are available within 30 days of purchase with a valid receipt.' },
  { source_id: 'pol-shipping-1', revision: '1.0', topic: 'shipping', approved_text: 'Standard shipping arrives in 5-7 business days; express in 1-2 business days.' },
  { source_id: 'pol-billing-1', revision: '1.0', topic: 'billing', approved_text: 'Billing questions can be reviewed by requesting an itemized invoice.' },
  { source_id: 'pol-escalation-1', revision: '1.0', topic: 'escalation', approved_text: 'Unsupported or disputed claims are escalated to a human agent.' },
]

const POLICIES_MAP: Record<string, Policy> = {}
for (const p of POLICIES) POLICIES_MAP[p.topic] = p

function classify(text: string): { category: string; confidence: number; matched: string[] } {
  const lower = text.toLowerCase()
  const rules: { category: string; keywords: string[] }[] = [
    { category: 'sales', keywords: ['buy', 'purchase', 'pricing', 'quote', 'cost', 'plan', 'upgrade'] },
    { category: 'billing', keywords: ['refund', 'charge', 'invoice', 'receipt', 'payment', 'billing', 'double charged'] },
    { category: 'escalation', keywords: ['complaint', 'manager', 'escalate', 'fraud', 'dispute', 'lawyer'] },
    { category: 'support', keywords: ['help', 'how do', 'not working', 'broken', 'error', 'reset', 'question'] }
  ]
  let best = 'support'
  let bestMatches: string[] = []
  let bestScore = 0
  for (const rule of rules) {
    const matched = rule.keywords.filter(k => lower.includes(k))
    if (matched.length > bestScore) {
      bestScore = matched.length
      best = rule.category
      bestMatches = matched
    }
  }
  const confidence = bestScore > 0 ? Math.min(0.95, 0.6 + 0.1 * bestScore) : 0.5
  return { category: best, confidence, matched: bestMatches }
}

function isEscalationTrigger(text: string): boolean {
  const lower = text.toLowerCase()
  return ['refund', 'dispute', 'fraud', 'manager', 'escalate', 'cancel'].some(k => lower.includes(k))
}

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', mode: 'cloudflare', utc: new Date().toISOString() })
})

app.get('/api/inquiries', async (c) => {
  try {
    if (c.env.DB) {
      const result = await c.env.DB.prepare(`SELECT * FROM inquiries ORDER BY received_utc DESC LIMIT 50`).all()
      return c.json(result.results || [])
    }
  } catch (e) { console.error('D1 error:', e) }
  return c.json([])
})

app.get('/api/inquiries/:id', async (c) => {
  try {
    if (c.env.DB) {
      const inq = await c.env.DB.prepare(`SELECT * FROM inquiries WHERE id=?`).bind(c.req.param('id')).first() as any
      if (!inq) return c.status(404).json({ error: 'inquiry not found' })
      const draft = await c.env.DB.prepare(`SELECT * FROM drafts WHERE inquiry_id=?`).bind(c.req.param('id')).first() as any
      return c.json({ inquiry: inq, draft })
    }
  } catch (e) { console.error('D1 error:', e) }
  return c.status(404).json({ error: 'inquiry not found' })
})

app.get('/api/policies', (c) => {
  return c.json(POLICIES)
})

app.get('/api/policies/:topic', (c) => {
  const pol = POLICIES.find(p => p.topic === c.req.param('topic'))
  if (!pol) return c.status(404).json({ error: 'policy not found' })
  return c.json(pol)
})

app.post('/api/inquiries', async (c) => {
  const body = await parseBody(c) as { text?: string }
  const { text } = body
  if (!text) return c.status(400).json({ error: 'text required' })

  const { category, confidence, matched } = classify(text)
  const urgency = isEscalationTrigger(text) ? 'high' : 'normal'
  const id = `inq:${crypto.randomUUID()}`
  const inq: Inquiry = { id, received_utc: new Date().toISOString(), text, category, urgency, state: 'queued' }

  try {
    if (c.env.DB) {
      await c.env.DB.prepare(
        `INSERT INTO inquiries (id, received_utc, text, category, urgency, state) VALUES (?,?,?,?,?,?)`
      ).bind(inq.id, inq.received_utc, inq.text, inq.category, inq.urgency, inq.state).run()
    }
  } catch (e) { console.error('D1 error:', e) }

  return c.json({ inquiry: inq, classification: { category, confidence, matched }, ai_demo: true })
})

app.post('/api/draft', async (c) => {
  const body = await parseBody(c) as { inquiry_id?: string }
  const { inquiry_id } = body

  let inq: any = null
  try {
    if (c.env.DB) {
      inq = await c.env.DB.prepare(`SELECT * FROM inquiries WHERE id=?`).bind(inquiry_id).first() as any
    }
  } catch (e) { console.error('D1 error:', e) }
  if (!inq) return c.status(404).json({ error: 'inquiry not found' })

  const pol = POLICIES_MAP[inq.category]
  let answer: string
  let citations: string
  let unsupported = 0

  if (pol) {
    answer = `Based on our policy: ${pol.approved_text}`
    citations = pol.source_id
  } else {
    answer = 'No matching policy found for this inquiry. A human agent will review it.'
    citations = 'none'
    unsupported = 1
  }

  if (inq.category === 'billing' || inq.category === 'escalation') {
    answer += ' This matter has been flagged for human review.'
    unsupported = 0
  }

  const draft: Draft = {
    id: `draft:${crypto.randomUUID()}`,
    inquiry_id,
    answer,
    citations,
    unsupported_claims: unsupported,
    created_utc: new Date().toISOString()
  }

  try {
    if (c.env.DB) {
      await c.env.DB.prepare(
        `INSERT INTO drafts (id, inquiry_id, answer, citations, unsupported_claims, created_utc) VALUES (?,?,?,?,?,?)`
      ).bind(draft.id, draft.inquiry_id, draft.answer, draft.citations, draft.unsupported_claims, draft.created_utc).run()
    }
  } catch (e) { console.error('D1 error:', e) }

  return c.json({ draft, inquiry_id, ai_demo: true })
})

app.post('/api/inquiries/:id/decide', async (c) => {
  const id = c.req.param('id')
  let inq: any = null
  try {
    if (c.env.DB) {
      inq = await c.env.DB.prepare(`SELECT * FROM inquiries WHERE id=?`).bind(id).first() as any
    }
  } catch (e) { console.error('D1 error:', e) }
  if (!inq) return c.status(404).json({ error: 'inquiry not found' })

  const body = await parseBody(c) as { actor?: string; approved?: boolean; reason?: string }
  const { actor, approved, reason } = body
  if (!actor) return c.status(400).json({ error: 'actor required' })

  const decId = `dec:${crypto.randomUUID()}`
  const decision: Decision = { id: decId, inquiry_id: id, actor, approved: !!approved, reason: reason ?? null, decided_utc: new Date().toISOString() }

  const activity = approved ? 'sandbox reply approved' : 'sandbox escalation recorded'
  const actId = `act:${crypto.randomUUID()}`

  try {
    if (c.env.DB) {
      await c.env.DB.prepare(
        `INSERT INTO decisions (id, inquiry_id, actor, approved, reason, decided_utc) VALUES (?,?,?,?,?,?)`
      ).bind(decision.id, decision.inquiry_id, decision.actor, decision.approved ? 1 : 0, decision.reason, decision.decided_utc).run()
      await c.env.DB.prepare(
        `INSERT INTO sandbox_activities (id, inquiry_id, activity, created_utc) VALUES (?,?,?,?)`
      ).bind(actId, id, activity, new Date().toISOString()).run()
    }
  } catch (e) { console.error('D1 error:', e) }

  return c.json({ decision, ai_demo: true })
})

app.get('/api/decisions', async (c) => {
  try {
    if (c.env.DB) {
      const result = await c.env.DB.prepare(`SELECT * FROM decisions ORDER BY decided_utc DESC LIMIT 50`).all()
      return c.json(result.results || [])
    }
  } catch (e) { console.error('D1 error:', e) }
  return c.json([])
})

app.get('/api/sandbox', async (c) => {
  try {
    if (c.env.DB) {
      const result = await c.env.DB.prepare(`SELECT * FROM sandbox_activities ORDER BY created_utc DESC LIMIT 50`).all()
      return c.json(result.results || [])
    }
  } catch (e) { console.error('D1 error:', e) }
  return c.json([])
})

app.get('/api/metrics', async (c) => {
  try {
    if (c.env.DB) {
      const inquiries = await c.env.DB.prepare(`SELECT * FROM inquiries`).all()
      const rows = inquiries.results || []
      const byCategory = rows.reduce((acc: Record<string, number>, inq: any) => { acc[inq.category] = (acc[inq.category] || 0) + 1; return acc }, {})
      const queueSize = rows.filter((i: any) => i.state === 'queued').length
      return c.json({ queue_size: queueSize, by_category: byCategory })
    }
  } catch (e) { console.error('D1 error:', e) }
  return c.json({ queue_size: 0, by_category: {} })
})

app.onError((err, c) => {
  console.error(err)
  return c.status(500).json({ error: 'internal server error' })
})

app.notFound((c) => {
  return c.status(404).json({ error: 'not found' })
})

export default app
