CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,capability_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preparations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,fingerprint TEXT NOT NULL,source_format TEXT NOT NULL,canonical TEXT NOT NULL,verification TEXT NOT NULL,transaction_json TEXT NOT NULL,summary_markdown TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,fingerprint));
CREATE INDEX IF NOT EXISTS preparations_workspace_created ON preparations(workspace_id,created_at DESC);
