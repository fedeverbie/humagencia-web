-- Aplicar solo a humagencia-autopista, después de comprobar PRAGMA table_info.
-- No cambiar ni repetir 0001 sobre la base creada por Claude.
ALTER TABLE hag_contactos ADD COLUMN company TEXT NOT NULL DEFAULT '';
ALTER TABLE hag_contactos ADD COLUMN schedule TEXT NOT NULL DEFAULT '';
