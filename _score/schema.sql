-- Base D1 "humagencia-score" (binding SCORE_DB en Cloudflare Pages)
CREATE TABLE IF NOT EXISTS legajos (
  id TEXT PRIMARY KEY,          -- ID interno del Índice de legajos (HUMA-...)
  nombre TEXT NOT NULL,
  puesto TEXT,
  localidad TEXT,
  pts TEXT NOT NULL DEFAULT '{}', -- Score v2.0: {"ent":0-35,"ref":0-20,"exp":0-15,"hab":0-10,"form":0-10,"disp":0-5,"comp":0-5}
  ev TEXT NOT NULL DEFAULT '{}',  -- evidencia por criterio: pend | decl | verif (pendiente no suma)
  total INTEGER NOT NULL DEFAULT 0,  -- puntaje observado (solo criterios evaluados)
  cobertura INTEGER NOT NULL DEFAULT 0, -- suma de máximos de los criterios evaluados
  estado TEXT NOT NULL DEFAULT 'sin_evaluar', -- sin_evaluar | preliminar | entrevistado | verificado
  etiqueta TEXT,                -- listo | prioritaria | desarrollar | insuficiente
  acciones TEXT NOT NULL DEFAULT '[]',
  version TEXT NOT NULL DEFAULT '2.0',
  score_fecha TEXT,
  pts_v1 TEXT,                  -- puntaje anterior (v1.0), para volver atrás
  fuente TEXT,                  -- de dónde salió el legajo (Drive, formulario, migración)
  clave TEXT,                   -- nombre normalizado para evitar duplicados (índice único)
  nota TEXT,
  foto TEXT,                    -- data URL de la foto reducida
  actualizado TEXT,
  actualizado_por TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS legajos_clave ON legajos(clave) WHERE clave IS NOT NULL;
