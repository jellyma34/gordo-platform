/**
 * Non-destructive SQL reference for Railway / ops.
 * Runtime uses ensure_* helpers on backend startup (create_all + ALTER).
 *
 * Default project: verba-phase-1 (ЖК Верба · 1 очередь).
 */

-- 1) Construction project_id + updated_at
ALTER TABLE tmc ADD COLUMN IF NOT EXISTS project_id VARCHAR(128);
UPDATE tmc SET project_id = 'verba-phase-1'
  WHERE project_id IS NULL OR project_id = '' OR lower(project_id) = 'default';
ALTER TABLE tmc ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE tmc ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE gpr_tasks ADD COLUMN IF NOT EXISTS project_id VARCHAR(128);
UPDATE gpr_tasks SET project_id = 'verba-phase-1'
  WHERE project_id IS NULL OR project_id = '' OR lower(project_id) = 'default';
ALTER TABLE gpr_tasks ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE gpr_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS project_id VARCHAR(128);
UPDATE tenders SET project_id = 'verba-phase-1'
  WHERE project_id IS NULL OR project_id = '' OR lower(project_id) = 'default';
ALTER TABLE tenders ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Unique keys scoped by project
CREATE UNIQUE INDEX IF NOT EXISTS uq_tmc_project_external ON tmc (project_id, external_id);
CREATE INDEX IF NOT EXISTS ix_tmc_project_part ON tmc (project_id, project_part);
CREATE INDEX IF NOT EXISTS ix_gpr_tasks_project_part ON gpr_tasks (project_id, part_id);
CREATE INDEX IF NOT EXISTS ix_tenders_project_part ON tenders (project_id, part_id);

-- 2) Marketing SoT
CREATE TABLE IF NOT EXISTS marketing_imports (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(128) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  raw_csv TEXT,
  file_name VARCHAR(512),
  uploaded_by VARCHAR(320),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_imports_project_kind
  ON marketing_imports (project_id, kind);
CREATE INDEX IF NOT EXISTS ix_marketing_imports_project_id
  ON marketing_imports (project_id);
