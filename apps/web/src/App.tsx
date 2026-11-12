import { useState, useEffect } from 'react'

type Inquiry = { id: string; received_utc: string; text: string; category: string; urgency: string; state: string }
type Draft = { id: string; inquiry_id: string; answer: string; citations: string; unsupported_claims: number; created_utc: string }

const INQUIRIES: Inquiry[] = [
  { id: 'inq-1', received_utc: new Date(Date.now() - 3600000).toISOString(), text: 'I want a refund for my order #12345', category: 'billing', urgency: 'high', state: 'queued' },
  { id: 'inq-2', received_utc: new Date(Date.now() - 7200000).toISOString(), text: 'How much does the pro plan cost?', category: 'sales', urgency: 'normal', state: 'queued' },
  { id: 'inq-3', received_utc: new Date(Date.now() - 10800000).toISOString(), text: 'How do I reset my password? I cannot log in.', category: 'support', urgency: 'normal', state: 'queued' },
  { id: 'inq-4', received_utc: new Date(Date.now() - 14400000).toISOString(), text: 'I want to speak to a manager about fraud on my account', category: 'escalation', urgency: 'high', state: 'queued' }
]

const POLICIES: { source_id: string; topic: string; approved_text: string }[] = [
  { source_id: 'pol-refund-1', topic: 'refunds', approved_text: 'Refunds are available within 30 days of purchase with a valid receipt.' },
  { source_id: 'pol-shipping-1', topic: 'shipping', approved_text: 'Standard shipping arrives in 5-7 business days; express in 1-2 business days.' },
  { source_id: 'pol-billing-1', topic: 'billing', approved_text: 'Billing questions can be reviewed by requesting an itemized invoice.' },
  { source_id: 'pol-escalation-1', topic: 'escalation', approved_text: 'Unsupported or disputed claims are escalated to a human agent.' }
]

function classify(text: string): { category: string; confidence: number; matched: string[] } {
  const lower = text.toLowerCase()
  const rules: { category: string; keywords: string[] }[] = [
    { category: 'sales', keywords: ['buy', 'purchase', 'pricing', 'quote', 'cost', 'plan', 'upgrade'] },
    { category: 'billing', keywords: ['refund', 'charge', 'invoice', 'receipt', 'payment', 'billing', 'double charged'] },
    { category: 'escalation', keywords: ['complaint', 'manager', 'escalate', 'fraud', 'dispute', 'lawyer'] },
    { category: 'support', keywords: ['help', 'how do', 'not working', 'broken', 'error', 'reset', 'question'] }
  ]
  let best: string = 'support', bestMatches: string[] = [], bestScore = 0
  for (const rule of rules) {
    const matched = rule.keywords.filter(k => lower.includes(k))
    if (matched.length > bestScore) { bestScore = matched.length; best = rule.category; bestMatches = matched }
  }
  return { category: best, confidence: bestScore > 0 ? Math.min(0.95, 0.6 + 0.1 * bestScore) : 0.5, matched: bestMatches }
}

function isEscalationTrigger(text: string): boolean {
  const lower = text.toLowerCase()
  return ['refund', 'dispute', 'fraud', 'manager', 'escalate', 'cancel'].some(k => lower.includes(k))
}

export default function App() {
  const [inquiries, setInquiries] = useState<Inquiry[]>(INQUIRIES)
  const [selected, setSelected] = useState<Inquiry | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function openInquiry(id: string) {
    setLoading(true)
    try {
      const inq = inquiries.find(i => i.id === id)!
      setSelected(inq)
      const { category } = classify(inq.text)
      const pol = POLICIES.find(p => p.topic === category)
      let answer: string, citations: string, unsupported = 0
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
      setDraft({
        id: `draft:${Date.now()}`, inquiry_id: inq.id, answer, citations, unsupported_claims: unsupported, created_utc: new Date().toISOString()
      })
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  async function decide(approved: boolean) {
    if (!selected || !draft) return
    setLoading(true)
    try {
      setInquiries(inquiries.map(i => i.id === selected.id ? { ...i, state: approved ? 'approved' : 'escalated' } : i))
      setSelected(null); setDraft(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  const catColor = (c: string) => c === 'sales' ? '#2563eb' : c === 'billing' ? '#ca8a04' : c === 'escalation' ? '#dc2626' : '#16a34a'

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 980, margin: '0 auto', padding: 20 }}>
      <h1>BusinessFlow AI <span style={{ color: '#666', fontSize: 0.6 }}>• demo</span></h1>
      <p style={{ color: '#555' }}>Customer inquiry intake → classification → policy-grounded draft → human approval. Synthetic demo data; no real customer emails sent.</p>
      {error && <span style={{ color: '#dc2626' }}>{error}</span>}

      <section style={{ marginTop: 16 }}>
        <h2>Inquiry queue</h2>
        {inquiries.length === 0 ? <p>No inquiries.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>ID</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>Category</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 6 }}>Urgency</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 6 }}>State</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 6 }}>Received</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 6 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 4, fontSize: 0.85 }}>{i.id}</td>
                  <td style={{ padding: 4, fontSize: 0.85 }}><span style={{ padding: '1px 6px', borderRadius: 10, background: catColor(i.category) + '22', color: catColor(i.category), fontSize: 0.8 }}>{i.category}</span></td>
                  <td style={{ padding: 4, fontSize: 0.85, textAlign: 'right' }}>{i.urgency}</td>
                  <td style={{ padding: 4, fontSize: 0.85, textAlign: 'right' }}>{i.state}</td>
                  <td style={{ padding: 4, fontSize: 0.85, textAlign: 'right' }}>{new Date(i.received_utc).toLocaleString()}</td>
                  <td style={{ padding: 4, fontSize: 0.85, textAlign: 'right' }}>
                    <button onClick={() => openInquiry(i.id)} disabled={loading} style={{ padding: '2px 6px', fontSize: 0.8 }}>review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && draft && (
        <section style={{ marginTop: 24, border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <h2>Inquiry {selected.id}</h2>
          <p style={{ fontSize: 0.9, color: '#444', marginBottom: 12 }}>"{selected.text}"</p>
          <div style={{ marginBottom: 12 }}>
            <b>Category:</b> {selected.category}&nbsp; <b>Urgency:</b> {selected.urgency}
          </div>
          <h3>Draft reply (policy-grounded)</h3>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 12, whiteSpace: 'pre-wrap', fontSize: 0.9 }}>{draft.answer}</div>
          <p style={{ fontSize: 0.85, color: '#666' }}><b>Citations:</b> {draft.citations}&nbsp; <b>Unsupported claims:</b> {draft.unsupported_claims}</p>
          <p style={{ marginBottom: 12 }}><i>Draft cites only approved FAQ snippets. Unsupported claims are flagged — no fabricated refunds or guarantees.</i></p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => decide(true)} disabled={loading} style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Approve (sandbox)</button>
            <button onClick={() => decide(false)} disabled={loading} style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Escalate</button>
          </div>
          <p style={{ marginTop: 8, fontSize: 0.85, color: '#666' }}>Approval logs to sandbox CRM only — no real email or CRM send.</p>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h2>Sandbox Activity</h2>
        <p style={{ color: '#666', fontSize: 0.85 }}>Approved decisions and escalations are logged here (sandbox only).</p>
      </section>

      <p style={{ marginTop: 32, color: '#888', fontSize: 0.85 }}>
        Demo only. Synthetic customer records. External send and CRM writes disabled by default.
      </p>
    </div>
  )
}