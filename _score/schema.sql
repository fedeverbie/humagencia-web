-- Base D1 "humagencia-score" (binding SCORE_DB en Cloudflare Pages)
CREATE TABLE IF NOT EXISTS legajos (
  id TEXT PRIMARY KEY,          -- ID interno del Índice de legajos (HUMA-...)
  nombre TEXT NOT NULL,
  puesto TEXT,
  localidad TEXT,
  pts TEXT NOT NULL DEFAULT '{}', -- {"cv":0-10,"ent":0-35,"ref":0-20,"form":0-10,"cur":0-10,"mov":0-5,"disp":0-5,"pres":0-5}
  total INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'preliminar', -- preliminar | evaluado | sin_evaluar
  nota TEXT,
  foto TEXT,                    -- data URL de la foto reducida
  actualizado TEXT,
  actualizado_por TEXT
);
