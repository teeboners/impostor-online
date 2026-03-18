# Usar imagen oficial de Node.js (versión LTS)
FROM node:20-alpine

# Instalar dependencias necesarias para Prisma y Alpine
RUN apk add --no-cache openssl

# Establecer directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json primero (para cachear dependencias)
COPY package*.json ./

# Instalar TODAS las dependencias (incluyendo prisma cli para generar el cliente)
RUN npm install

# Copiar el esquema de Prisma y generarlo antes de copiar el resto del código
COPY prisma ./prisma/
RUN npx prisma generate

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto que usará Express
EXPOSE 3000

# Script de arranque: Empuja cambios a la BD (si los hay) y arranca el servidor
# Si usas Postgres, asegúrate de que DATABASE_URL apunte a tu DB real
CMD ["sh", "-c", "npx prisma db push && npm start"]
