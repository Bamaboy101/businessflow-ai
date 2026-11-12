import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { z } from 'zod'
import { randomUUID as uuidv4 } from 'crypto'
import { initDb, db, seed, createInquiry, listInquiries, getInquiry, listPolicies, findPolicy, createDraft, getDraft, createDecision, listDecisions, listSandboxActivities, metrics, type Inquiry, type Draft, type Decision } from './store'
import { classify, isEscalationTrigger, type Category } from './classify'
import { createAIProvider } from './ai/provider'

const app = express()
const PORT = Number(process.env.PORT) || 4003
const ai = createAIProvider()

app.use(cors())
app.use(express.json())

app.use((_req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now()
  _res.on('finish', () => {
    console.log(`${_req.method} ${_req.originalUrl} ${_res.statusCode} ${Date.now() - start}ms`)
  })
  next()
})

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ai_provider: ai.provider, ai_demo: ai.isDemo, utc: new Date().toISOString() })
})

const intakeBody = z.object({ text: z.string().min(1).max(10000) })
app.post('/api/inquiries', (req: Request, res: Response) => {
  const parsed = intakeBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() })
  const { text } = parsed.data

  const { category, confidence, matched } = classify(text)
  const urgency = isEscalationTrigger(text) ? 'high' : 'normal'
  const id = `inq:${uuidv4()}`
  createInquiry(db, id, text, category, urgency)

  const inquiry: Inquiry = { id, received_utc: new Date().toISOString(), text, category, urgency, state: 'queued' }
  res.json({ inquiry, classification: { category, confidence, matched }, ai_demo: true })
})

app.get('/api/inquiries', (_req: Request, res: Response) => {
  res.json(listInquiries(db))
})

app.get('/api/inquiries/:id', (req: Request, res: Response) => {
  const inq = getInquiry(db, req.params.id)
  if (!inq) return res.status(404).json({ error: 'inquiry not found' })
  const draft = getDraft(db, inq.id)
  res.json({ inquiry: inq, draft })
})

app.get('/api/policies', (_req: Request, res: Response) => {
  res.json(listPolicies(db))
})

app.get('/api/policies/:topic', (req: Request, res: Response) => {
  const pol = findPolicy(db, req.params.topic)
  if (!pol) return res.status(404).json({ error: 'policy not found' })
  res.json(pol)
})

const draftBody = z.object({ inquiry_id: z.string().min(1) })
app.post('/api/draft', (req: Request, res: Response) => {
  const parsed = draftBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() })
  const { inquiry_id } = parsed.data

  const inq = getInquiry(db, inquiry_id)
  if (!inq) return res.status(404).json({ error: 'inquiry not found' })

  // Grounded lookup: only approved policy snippets
  const pol = findPolicy(db, inq.category)
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

  // Refund/billing -> escalate (no fabricated guarantees)
  if (inq.category === 'billing' || inq.category === 'escalation') {
    answer += ' This matter has been flagged for human review.'
    unsupported = 0
  }

  const draft: Draft = {
    id: `draft:${uuidv4()}`,
    inquiry_id,
    answer,
    citations,
    unsupported_claims: unsupported,
    created_utc: new Date().toISOString()
  }
  createDraft(db, draft)
  res.json({ draft, inquiry_id, ai_demo: true })
})

const approveBody = z.object({ inquiry_id: z.string().min(1), actor: z.string().min(1), approved: z.boolean(), reason: z.string().optional() })
app.post('/api/inquiries/:id/decide', (req: Request, res: Response) => {
  const inq = getInquiry(db, req.params.id)
  if (!inq) return res.status(404).json({ error: 'inquiry not found' })

  const parsed = approveBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() })
  const { actor, approved, reason } = parsed.data

  const id = `dec:${uuidv4()}`
  createDecision(db, id, inq.id, actor, approved, reason ?? null)

  const decision: Decision = { id, inquiry_id: inq.id, actor, approved, reason: reason ?? null, decided_utc: new Date().toISOString() }
  res.json({ decision, ai_demo: true })
})

app.get('/api/decisions', (_req: Request, res: Response) => {
  res.json(listDecisions(db))
})

app.get('/api/sandbox', (_req: Request, res: Response) => {
  res.json(listSandboxActivities(db))
})

app.get('/api/metrics', (_req: Request, res: Response) => {
  res.json(metrics(db))
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not found' })
})
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'internal server error' })
})

initDb()
seed(db)

app.listen(PORT, () => {
  console.log(`BusinessFlow API listening on :${PORT} (ai=${ai.provider}, demo=${ai.isDemo})`)
})

export default app
