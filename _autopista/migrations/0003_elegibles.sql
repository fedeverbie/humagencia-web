-- Lista de registrados elegibles para la Autopista (REGISTRY sobre D1).
-- La sincroniza la tarea de Claude desde el Índice de legajos: solo registros
-- reales con CV y autorización. Sin email en claro, nombres ni teléfonos.
CREATE TABLE IF NOT EXISTS cabina_elegibles (
  email_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
