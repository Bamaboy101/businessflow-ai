/**
 * Deterministic intent classification.
 * Maps customer inquiry text into sales/support/billing/escalation.
 * Never lets customer text override policy or system rules.
 */

export type Category = 'sales' | 'support' | 'billing' | 'escalation'

const RULES: Array<{ category: Category; keywords: string[] }> = [
  { category: 'sales', keywords: ['buy', 'purchase', 'pricing', 'quote', 'cost', 'plan', 'upgrade'] },
  { category: 'billing', keywords: ['refund', 'charge', 'invoice', 'receipt', 'payment', 'billing', 'double charged'] },
  { category: 'escalation', keywords: ['complaint', 'manager', 'escalate', 'fraud', 'dispute', 'lawyer'] },
  { category: 'support', keywords: ['help', 'how do', 'not working', 'broken', 'error', 'reset', 'question'] }
]

export function classify(text: string): { category: Category; confidence: number; matched: string[] } {
  const lower = text.toLowerCase()
  let best: Category = 'support'
  let bestMatches: string[] = []
  let bestScore = 0

  for (const rule of RULES) {
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

export function isEscalationTrigger(text: string): boolean {
  const lower = text.toLowerCase()
  return ['refund', 'dispute', 'fraud', 'manager', 'escalate', 'cancel'].some(k => lower.includes(k))
}
