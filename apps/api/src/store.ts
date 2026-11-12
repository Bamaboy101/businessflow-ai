import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH = process.env.BUSINESSFLOW_DB_PATH || resolve(process.cwd(), 'businessflow.db')
export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      received_utc TEXT NOT NULL,
      text TEXT NOT NULL,
      category TEXT NOT NULL,
      urgency TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued'
    );
    CREATE TABLE IF NOT EXISTS policies (
      source_id TEXT PRIMARY KEY,
      revision TEXT NOT NULL,
      topic TEXT NOT NULL,
      approved_text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      citations TEXT NOT NULL,
      unsupported_claims INTEGER NOT NULL DEFAULT 0,
      created_utc TEXT NOT NULL,
      FOREIGN KEY (inquiry_id) REFERENCES inquiries(id)
    );
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      decided_utc TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sandbox_activities (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      activity TEXT NOT NULL,
      created_utc TEXT NOT NULL
    );
  `)
}

export interface Inquiry { id: string; received_utc: string; text: string; category: string; urgency: string; state: string }
export interface Policy { source_id: string; revision: string; topic: string; approved_text: string }
export interface Draft { id: string; inquiry_id: string; answer: string; citations: string; unsupported_claims: number; created_utc: string }
export interface Decision { id: string; inquiry_id: string; actor: string; approved: boolean; reason: string | null; decided_utc: string }
export interface SandboxActivity { id: string; inquiry_id: string; activity: string; created_utc: string }

const POLICIES: Policy[] = [
  { source_id: 'pol-refund-1', revision: '1.0', topic: 'refunds', approved_text: 'Refunds are available within 30 days of purchase with a valid receipt.' },
  { source_id: 'pol-shipping-1', revision: '1.0', topic: 'shipping', approved_text: 'Standard shipping arrives in 5-7 business days; express in 1-2 business days.' },
  { source_id: 'pol-billing-1', revision: '1.0', topic: 'billing', approved_text: 'Billing questions can be reviewed by requesting an itemized invoice.' },
  { source_id: 'pol-escalation-1', revision: '1.0', topic: 'escalation', approved_text: 'Unsupported or disputed claims are escalated to a human agent.' }
]

export function seed(db: Database.Database) {
  const ins = db.prepare(`INSERT OR IGNORE INTO policies (source_id, revision, topic, approved_text) VALUES (?,?,?,?)`)
  for (const p of POLICIES) ins.run(p.source_id, p.revision, p.topic, p.approved_text)
}

export function createInquiry(db: Database.Database, id: string, text: string, category: string, urgency: string) {
  const stmt = db.prepare(`INSERT INTO inquiries (id, received_utc, text, category, urgency, state) VALUES (?,?,?,?,?,'queued')`)
  stmt.run(id, new Date().toISOString(), text, category, urgency)
}

export function listInquiries(db: Database.Database): Inquiry[] {
  return db.prepare(`SELECT * FROM inquiries ORDER BY received_utc DESC`).all() as Inquiry[]
}

export function getInquiry(db: Database.Database, id: string): Inquiry | undefined {
  return db.prepare(`SELECT * FROM inquiries WHERE id = ?`).get(id) as Inquiry | undefined
}

export function listPolicies(db: Database.Database): Policy[] {
  return db.prepare(`SELECT * FROM policies ORDER BY topic`).all() as Policy[]
}

export function findPolicy(db: Database.Database, topic: string): Policy | undefined {
  return db.prepare(`SELECT * FROM policies WHERE topic = ? LIMIT 1`).get(topic) as Policy | undefined
}

export function createDraft(db: Database.Database, draft: Draft) {
  const stmt = db.prepare(`INSERT INTO drafts (id, inquiry_id, answer, citations, unsupported_claims, created_utc) VALUES (?,?,?,?,?,?)`)
  stmt.run(draft.id, draft.inquiry_id, draft.answer, draft.citations, draft.unsupported_claims ? 1 : 0, draft.created_utc)
}

export function getDraft(db: Database.Database, inquiryId: string): Draft | undefined {
  return db.prepare(`SELECT * FROM drafts WHERE inquiry_id = ? ORDER BY created_utc DESC LIMIT 1`).get(inquiryId) as Draft | undefined
}

export function createDecision(db: Database.Database, id: string, inquiryId: string, actor: string, approved: boolean, reason: string | null) {
  const stmt = db.prepare(`INSERT INTO decisions (id, inquiry_id, actor, approved, reason, decided_utc) VALUES (?,?,?,?,?,?)`)
  stmt.run(id, inquiryId, actor, approved ? 1 : 0, reason, new Date().toISOString())
  db.prepare(`UPDATE inquiries SET state = ? WHERE id = ?`).run(approved ? 'approved' : 'escalated', inquiryId)
  const activity = approved ? 'sandbox reply approved' : 'sandbox escalation recorded'
  db.prepare(`INSERT INTO sandbox_activities (id, inquiry_id, activity, created_utc) VALUES (?,?,?,?)`).run(`act:${Date.now()}`, inquiryId, activity, new Date().toISOString())
}

export function listDecisions(db: Database.Database): Decision[] {
  return db.prepare(`SELECT * FROM decisions ORDER BY decided_utc DESC`).all() as Decision[]
}

export function listSandboxActivities(db: Database.Database): SandboxActivity[] {
  return db.prepare(`SELECT * FROM sandbox_activities ORDER BY created_utc DESC`).all() as SandboxActivity[]
}

export function metrics(db: Database.Database) {
  const byCategory = db.prepare(`SELECT category, COUNT(*) AS c FROM inquiries GROUP BY category`).all() as { category: string; c: number }[]
  const queueSize = db.prepare(`SELECT COUNT(*) AS c FROM inquiries WHERE state = 'queued'`).get() as { c: number }
  return { queue_size: queueSize.c, by_category: byCategory }
}
