import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_BASE || ''

type Inquiry = { id: string; received_utc: string; text: string; category: string; urgency: string; state: string }
type Draft = { id: string; inquiry_id: string; answer: string; citations: string; unsupported_claims: number; created_utc: string }

export default function App() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [selected, setSelected] = useState<Inquiry | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadInquiries()
    const t = setInterval(loadInquiries, 4000)
    return () => clearInterval(t)
  }, [])

  async function loadInquiries() {
    try { setInquiries(await (await fetch(`${API}/api/inquiries`)).json()) } catch {}
  }

  async function openInquiry(id: string) {
    setLoading(true)
    try {
      const inq = inquiries.find(i => i.id === id) || (await (await fetch(`${API}/api/inquiries/${id}`))).json()
      setSelected(inq)
      const r = await fetch(`${API}/api/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiry_id: id }) })
      const data = await r.json()
      setDraft(data.draft)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  async function decide(approved: boolean) {
    if (!selected || !draft) return
    setLoading(true)
    try {
      await fetch(`${API}/api/inquiries/${selected.id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiry_id: selected.id, actor: 'operator-1', approved, reason: approved ? 'policy-grounded reply' : 'unsupported claim / needs human review' })
      })
      loadInquiries()
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
        <h2>Sandbox activity</h2>
        <p style={{ color: '#666', fontSize: 0.85 }}>Approved decisions and escalations are logged here (sandbox only).</p>
      </section>

      <p style={{ marginTop: 32, color: '#888', fontSize: 0.85 }}>
        Demo only. Synthetic customer records. External send and CRM writes disabled by default.
      </p>
    </div>
  )
}
