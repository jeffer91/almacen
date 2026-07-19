# Almacén Familiar Móvil

Esta carpeta contiene la versión web instalable (PWA) para celulares.

- Guarda productos, proveedores, costos y precios primero en el navegador.
- Calcula automáticamente el precio sin IVA a partir del PVP con IVA.
- Sincroniza instantáneas con la misma colección de Firebase utilizada por la aplicación de escritorio.
- Puede instalarse desde el navegador mediante **Agregar a pantalla de inicio**.

La primera sincronización solicita la API key configurada en la aplicación de escritorio y la conserva únicamente en el almacenamiento local del celular.

La publicación automática se realiza con el flujo `.github/workflows/web-deploy.yml` cuando GitHub Pages está habilitado para el repositorio.
