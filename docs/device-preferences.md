# Configuración del equipo y accesibilidad

## Objetivo

Cada instalación conserva su propia configuración para que la aplicación sea fácil de leer y utilizar en la computadora de Edgar, Gloria o Jefferson.

Las preferencias se guardan en la tabla `device_settings` de la base SQLite local. No dependen de internet.

## Valores predeterminados

### Edgar y Gloria

- Letra grande.
- Movimiento reducido.
- Contraste normal.
- Ventana maximizada.
- Nombre automático: `Computadora de Edgar` o `Computadora de Gloria`.

### Jefferson

- Letra normal.
- Movimiento normal.
- Contraste normal.
- Ventana maximizada.
- Nombre automático: `Computadora de Jefferson`.

## Cambio rápido de letra

El botón **Letra** está disponible en la parte superior para todos los usuarios. Cambia entre:

1. Normal.
2. Grande.
3. Muy grande.

El cambio se aplica inmediatamente y queda guardado en la computadora.

## Configuración administrativa

Desde **Administración → Configuración del equipo**, Jefferson puede modificar:

- nombre fácil del equipo;
- tamaño de la letra;
- contraste alto;
- reducción de movimientos;
- apertura maximizada.

La configuración completa requiere una sesión administrativa activa.

## Seguridad y validación

- El nombre del equipo se limita a 60 caracteres.
- Los espacios repetidos se normalizan.
- Solo se aceptan los tamaños `normal`, `large` y `xlarge`.
- Los valores desconocidos vuelven a la configuración recomendada del perfil.
- Edgar y Gloria pueden cambiar el tamaño de letra, pero no pueden modificar la configuración técnica completa sin la contraseña administrativa.
