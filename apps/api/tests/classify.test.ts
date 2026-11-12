import { describe, it, expect } from 'vitest'
import { classify } from '../src/classify'

describe('classifier', () => {
  it('classifies refund as billing/high urgency signal', () => {
    const r = classify('I want a refund for my order')
    expect(r.category).toBe('billing')
    expect(r.matched.length).toBeGreaterThan(0)
  })

  it('classifies purchase as sales', () => {
    const r = classify('How much does the pro plan cost?')
    expect(r.category).toBe('sales')
  })

  it('classifies escalation keywords', () => {
    const r = classify('I want to speak to a manager about fraud')
    expect(r.category).toBe('escalation')
  })

  it('defaults to support', () => {
    const r = classify('How do I reset my password?')
    expect(r.category).toBe('support')
  })
})
