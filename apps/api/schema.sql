CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  received_utc TEXT NOT NULL,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  urgency TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued'
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations TEXT NOT NULL,
  unsupported_claims INTEGER DEFAULT 0,
  created_utc TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS policies (
  source_id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  topic TEXT NOT NULL,
  approved_text TEXT NOT NULL
);

INSERT OR IGNORE INTO policies (source_id, revision, topic, approved_text) VALUES
  ('pol-refund-1', '1.0', 'refunds', 'Refunds are available within 30 days of purchase with a valid receipt.'),
  ('pol-shipping-1', '1.0', 'shipping', 'Standard shipping arrives in 5-7 business days; express in 1-2 business days.'),
  ('pol-billing-1', '1.0', 'billing', 'Billing questions can be reviewed by requesting an itemized invoice.'),
  ('pol-escalation-1', '1.0', 'escalation', 'Unsupported or disputed claims are escalated to a human agent.');
