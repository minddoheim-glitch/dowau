CREATE TABLE IF NOT EXISTS subscribers (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 status TEXT NOT NULL CHECK(status IN ('pending','active','unsubscribed')),
 confirm_hash TEXT, confirm_until INTEGER, unsubscribe_hash TEXT NOT NULL UNIQUE,
 consent_version TEXT NOT NULL, consent_at INTEGER NOT NULL,
 confirmed_at INTEGER, unsubscribed_at INTEGER, last_request_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscribers_status ON subscribers(status, id);
CREATE TABLE IF NOT EXISTS deliveries (
 issue_id TEXT NOT NULL, subscriber_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('sending','sent','uncertain')),
 attempted_at INTEGER NOT NULL, provider_id TEXT,
 PRIMARY KEY(issue_id, subscriber_id),
 FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
