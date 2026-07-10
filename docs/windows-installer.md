# Instalador de Windows

## Objetivo

Generar un instalador NSIS de 64 bits para Windows y comprobar automáticamente que el archivo contiene la aplicación esperada y puede instalarse de forma silenciosa.

## Comando local

En Windows:

```powershell
npm install
npm run release:win
```

El comando ejecuta:

1. Pruebas automáticas.
2. Compilación con `electron-builder`.
3. Verificación del instalador y del contenido empaquetado.

## Archivo generado

El instalador utiliza el formato:

```text
Almacen-Familiar-Setup-<version>-x64.exe
```

Los archivos de salida quedan en:

```text
dist/
```

## Configuración NSIS

- Instalación por usuario.
- Arquitectura x64.
- Selección de carpeta permitida.
- Acceso directo en el escritorio.
- Acceso directo en el menú Inicio.
- Los datos locales no se borran al desinstalar.
- La aplicación puede abrirse al terminar la instalación.

## Verificación automatizada

El script `scripts/verify-windows-build.ps1` comprueba:

- existencia y tamaño mínimo del instalador;
- presencia del ejecutable desempaquetado;
- presencia de `resources/app.asar`;
- contenido obligatorio dentro de `app.asar`;
- instalación silenciosa en una carpeta temporal;
- coincidencia del `app.asar` instalado con el compilado;
- hash SHA-256 del instalador;
- estado de la firma Authenticode.

El resultado se guarda en:

```text
dist/installer-verification.json
```

## GitHub Actions

El flujo `.github/workflows/windows-installer.yml` se ejecuta cuando cambian archivos relacionados con la aplicación o la compilación.

El flujo:

1. Descarga el repositorio.
2. Prepara Node.js.
3. Instala dependencias.
4. Ejecuta las pruebas.
5. Compila el instalador.
6. Realiza una instalación silenciosa de prueba.
7. Publica el instalador como artefacto de GitHub durante 30 días.

## Firma digital

La primera compilación no utiliza un certificado de firma de código. Windows puede mostrar una advertencia de editor desconocido o SmartScreen.

La verificación registra este estado, pero no lo considera un fallo. Antes de distribuir públicamente la aplicación deberá incorporarse un certificado de firma de código.

## Icono

El primer instalador usa el icono predeterminado de Electron. El icono institucional se incorporará cuando exista un archivo definitivo `build/icon.ico`.
