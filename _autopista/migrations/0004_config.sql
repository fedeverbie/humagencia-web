-- Configuración privada de la Autopista. Clave 'hmac': secreto compartido con
-- los scripts de Apps Script (MAILER y recibo del receptor de CV). Se carga a
-- mano, nunca desde el repositorio.
CREATE TABLE IF NOT EXISTS cabina_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
