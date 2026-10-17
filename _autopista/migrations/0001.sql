PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS cabina_usuarios (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
  verificado_at INTEGER NOT NULL, ultimo_ingreso INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cabina_enlaces (
  hash TEXT PRIMARY KEY, email TEXT NOT NULL, intent_hash TEXT NOT NULL,
  hag_id TEXT NOT NULL DEFAULT '', vence INTEGER NOT NULL,
  usado_at INTEGER, habilitado INTEGER NOT NULL DEFAULT 0 CHECK(habilitado IN (0,1))
);
CREATE INDEX IF NOT EXISTS enlaces_vence ON cabina_enlaces(vence);
CREATE TABLE IF NOT EXISTS cabina_sesiones (
  hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES cabina_usuarios(id),
  creado_at INTEGER NOT NULL, vence INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_vence ON cabina_sesiones(vence);
CREATE TABLE IF NOT EXISTS cabina_recibos (
  hash TEXT PRIMARY KEY, consumido_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cabina_limites (
  clave TEXT PRIMARY KEY, cantidad INTEGER NOT NULL, vence INTEGER NOT NULL
);
-- Única tabla de avisos; solo la carga validada de Claude la actualiza.
CREATE TABLE IF NOT EXISTS hag_contactos (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, city TEXT NOT NULL, category TEXT NOT NULL,
  source_label TEXT NOT NULL, apply_mode TEXT NOT NULL CHECK(apply_mode IN ('email','whatsapp','presencial','web','consultar')),
  apply_target TEXT NOT NULL, apply_instructions TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, checked_at TEXT NOT NULL, review_after TEXT NOT NULL,
  actualizado TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('published','closed'))
);
CREATE INDEX IF NOT EXISTS hag_vigentes ON hag_contactos(status,review_after);
CREATE TABLE IF NOT EXISTS hag_lotes (
  id TEXT PRIMARY KEY, generado_at TEXT NOT NULL UNIQUE, importado_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cabina_postulaciones (
  usuario_id TEXT NOT NULL REFERENCES cabina_usuarios(id), hag_id TEXT NOT NULL REFERENCES hag_contactos(id),
  abierto_at INTEGER NOT NULL, ultima_apertura INTEGER NOT NULL,
  postulado_at INTEGER,
  PRIMARY KEY(usuario_id,hag_id)
);
