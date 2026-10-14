-- Score v2.0: columnas nuevas. pts_v1 guarda el puntaje anterior para poder volver atrás.
ALTER TABLE legajos ADD COLUMN ev TEXT NOT NULL DEFAULT '{}';
ALTER TABLE legajos ADD COLUMN cobertura INTEGER NOT NULL DEFAULT 0;
ALTER TABLE legajos ADD COLUMN etiqueta TEXT;
ALTER TABLE legajos ADD COLUMN acciones TEXT NOT NULL DEFAULT '[]';
ALTER TABLE legajos ADD COLUMN version TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE legajos ADD COLUMN score_fecha TEXT;
ALTER TABLE legajos ADD COLUMN pts_v1 TEXT;
ALTER TABLE legajos ADD COLUMN fuente TEXT;
ALTER TABLE legajos ADD COLUMN clave TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS legajos_clave ON legajos(clave) WHERE clave IS NOT NULL;
