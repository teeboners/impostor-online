require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function test() {
  try {
    console.log('--- Iniciando prueba de Base de Datos Local ---');
    
    // Limpiar tests anteriores si existen
    await prisma.user.deleteMany({ where: { username: 'TestAgent' } });
    console.log('[OK] BD Limpia para el Test');

    // 1. Crear Usuario
    console.log('-> 1. Creando usuario "TestAgent" con correo "test@agente.com"...');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('secreta123', salt);
    
    const newUser = await prisma.user.create({
      data: {
        username: 'TestAgent',
        email: 'test@agente.com',
        passwordHash: hash
      }
    });
    console.log('[OK] Usuario creado exitosamente con ID:', newUser.id);

    // 2. Simular Login por Username
    console.log('-> 2. Buscando usuario por Username ("TestAgent")...');
    const userByUsername = await prisma.user.findFirst({
        where: { OR: [{ username: 'TestAgent' }, { email: 'TestAgent' }] }
    });
    console.log(userByUsername ? '[OK] ¡Encontrado por Username!' : '[ERROR] No encontrado');

    // 3. Simular Login por Correo
    console.log('-> 3. Buscando usuario por Correo ("test@agente.com")...');
    const userByEmail = await prisma.user.findFirst({
        where: { OR: [{ username: 'test@agente.com' }, { email: 'test@agente.com' }] }
    });
    console.log(userByEmail ? '[OK] ¡Encontrado por Correo Electrónico!' : '[ERROR] No encontrado');

    console.log('--- Prueba finalizada con Éxito ---');
  } catch(e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

test();
