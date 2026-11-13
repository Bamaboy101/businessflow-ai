import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`)
  })
  next()
})

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

const inquiries: Inquiry[] = []
const drafts: Draft[] = []
const decisions: Decision[] = []
const sandboxActivities: SandboxActivity[] = []

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'demo', utc: new Date().toISOString() })
})

app.get('/api/inquiries', (_req, res) => {
  res.json(inquiries)
})

app.get('/api/inquiries/:id', (req, res) => {
  const inq = inquiries.find(i => i.id === req.params.id)
  if (!inq) return res.status(404).json({ error: 'inquiry not found' })
  const draft = drafts.find(d => d.inquiry_id === inq.id)
  res.json({ inquiry: inq, draft })
})

app.get('/api/policies', (_req, res) => {
  res.json(POLICIES)
})

app.get('/api/policies/:topic', (req, res) => {
  const pol = POLICIES.find(p => p.topic === req.params.topic)
  if (!pol) return res.status(404).json({ error: 'policy not found' })
  res.json(pol)
})

app.post('/api/inquiries', (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })

  const { category, confidence, matched } = classify(text)
  const urgency = isEscalationTrigger(text) ? 'high' : 'normal'
  const id = `inq:${crypto.randomUUID()}`
  const inq: Inquiry = { id, received_utc: new Date().toISOString(), text, category, urgency, state: 'queued' }
  inquiries.push(inq)
  res.json({ inquiry: inq, classification: { category, confidence, matched }, ai_demo: true })
})

app.post('/api/draft', (req, res) => {
  const { inquiry_id } = req.body
  const inq = inquiries.find(i => i.id === inquiry_id)
  if (!inq) return res.status(404).json({ error: 'inquiry not found' })

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
  drafts.push(draft)
  res.json({ draft, inquiry_id, ai_demo: true })
})

app.post('/api/inquiries/:id/decide', (req, res) => {
  const inq = inquiries.find(i => i.id === req.params.id)
  if (!inq) return res.status(404).json({ error: 'inquiry not found' })

  const { actor, approved, reason } = req.body
  if (!actor) return res.status(400).json({ error: 'actor required' })

  const id = `dec:${crypto.randomUUID()}`
  const decision: Decision = { id, inquiry_id: inq.id, actor, approved: !!approved, reason: reason ?? null, decided_utc: new Date().toISOString() }
  decisions.push(decision)
  const activity = approved ? 'sandbox reply approved' : 'sandbox escalation recorded'
  sandboxActivities.push({ id: `act:${crypto.randomUUID()}`, inquiry_id: inq.id, activity, created_utc: new Date().toISOString() })

  res.json({ decision, ai_demo: true })
})

app.get('/api/decisions', (_req, res) => {
  res.json(decisions)
})

app.get('/api/sandbox', (_req, res) => {
  res.json(sandboxActivities)
})

app.get('/api/metrics', (_req, res) => {
  const byCategory = inquiries.reduce((acc, inq) => { acc[inq.category] = (acc[inq.category] || 0) + 1; return acc }, {} as Record<string, number>)
  const queueSize = inquiries.filter(i => i.state === 'queued').length
  res.json({ queue_size: queueSize, by_category: byCategory })
})

app.listen(4004, () => {
  console.log('BusinessFlow API listening on http://localhost:4004')
})

export default app
