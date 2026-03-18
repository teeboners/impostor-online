# Impostor Online

Plataforma web multijugador base.

## Requisitos previos

- Node.js instalado.

## Instalación

```bash
npm install
```

## Comandos

### Iniciar Servidor (Manual)
Para iniciar el servidor en modo producción:
```bash
npm start
```
El servidor escuchará en el puerto 3000 (o el definido en `.env`).

### Iniciar en Modo Desarrollo
Para reiniciar automáticamente al hacer cambios (requiere Node.js v18.11+ para `--watch`):
```bash
npm run dev
```

### Detener el Servidor
En la terminal donde se está ejecutando el servidor, presiona:
`Ctrl + C`

## Estructura
- `src/server.js`: Punto de entrada.
- `src/controllers/`: Lógica de juego.
- `public/`: Archivos estáticos del frontend.

## Ejecución Permanente (Segundo Plano)

Para que el servidor se mantenga activo aunque cierres la terminal y se inicie con Windows:

1. **Instalar herramienta de inicio**:
   ```powershell
   npm install -g pm2-windows-startup
   pm2-startup install
   ```
2. **Guardar la lista actual**:
   ```powershell
   pm2 save
   ```

Si en el futuro quieres quitarlo del inicio:
```powershell
pm2-startup uninstall
```
