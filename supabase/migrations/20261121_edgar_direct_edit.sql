-- Modo edición sin código para el enlace de Edgar.
-- Importante: la clave está publicada en web/edgar/access.js; no autentica a nadie.
-- Cualquiera que acceda a la ruta /edgar/ puede escribir en el catálogo con este permiso.
-- No proporciona control de identidad, sólo es un identificador revocable de este modo.
insert into public.family_editor_keys(fingerprint,invitation) values ('5279e532b4e5feef3515cfc2e2639d91e40b85e57355b26c027318900d5a8e15',false)
on conflict (fingerprint) do nothing;
-- Para revocar este modo, borrar exclusivamente el fingerprint anterior.
