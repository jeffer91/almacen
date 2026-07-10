# Recursos de compilación

Esta carpeta está reservada para los recursos visuales utilizados por `electron-builder`.

El primer instalador utiliza el icono predeterminado de Electron porque todavía no se ha incorporado un archivo institucional `.ico`.

Cuando exista el diseño definitivo, se deberá agregar:

```text
build/icon.ico
```

Después se actualizará `electron-builder.yml` para utilizarlo en el ejecutable, el instalador y los accesos directos.
