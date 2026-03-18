#!/bin/bash

# Este script automatiza la descarga y levantamiento del juego Impostor
# en la VPS usando git y docker-compose.

echo "============================================="
echo "🎮 DESPLIEGUE IMPOSTOR ONLINE - INICIANDO"
echo "============================================="

echo "1. Obtendiendo el último código desde GitHub (main)..."
git pull origin main

echo "2. Bajando contenedores anteriores (limpiando)..."
docker-compose down

echo "3. Reconstruyendo imagen Node y levantando BD..."
docker-compose up --build -d

echo "4. Esperando 5 segundos para que PostgreSQL despierte internamente..."
sleep 5

echo "5. Creando las tablas en la base de datos de Docker (Prisma DB Push)..."
docker exec -it impostor_game_app npx prisma db push

echo "============================================="
echo "✅ DESPLIEGUE COMPLETADO (JUEGO OPERATIVO)"
echo "✅ Comando para ver logs: docker logs -f impostor_game_app"
echo "============================================="
