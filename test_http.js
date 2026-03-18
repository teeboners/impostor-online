async function testApi() {
  console.log("=== Ejecutando Prueba de API de Autenticación ===");
  const testUser = `Agente_${Math.floor(Math.random() * 1000)}`;
  const testEmail = `${testUser}@correo.com`;
  
  try {
    // 1. Registrar
    console.log(`1. Registrando: ${testUser} | ${testEmail}`);
    const regRes = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser, email: testEmail, password: '123' })
    });
    
    const regData = await regRes.json();
    console.log('Respuesta Registro:', regRes.status, regData);

    if (!regRes.ok) throw new Error("Registro falló, asegúrate de que el servidor está corriendo en el puerto 3000");

    // 2. Login con Username
    console.log(`\n2. Login con Username: ${testUser}`);
    const loginUserRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser, password: '123' })
    });
    console.log('Respuesta Login Username:', loginUserRes.status, await loginUserRes.json());

    // 3. Login con Email
    console.log(`\n3. Login con Email: ${testEmail}`);
    const loginEmailRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testEmail, password: '123' })
    });
    console.log('Respuesta Login Email:', loginEmailRes.status, await loginEmailRes.json());

    console.log("\n=== PRUEBA COMPLETADA CON EXITO ===");
  } catch (err) {
    console.error("Error durante la prueba:", err.message);
  }
}

testApi();
