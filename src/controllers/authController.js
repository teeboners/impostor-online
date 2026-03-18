const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-pixoguess-key-2026';

// --- REGISTRO ---
const register = async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({ error: 'Usuario, correo y contraseña requeridos' });
        }

        // Verificar si existe el usuario
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    { email }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'El nombre de usuario o correo ya está en uso' });
        }

        // Hashear el password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Crear usuario
        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                passwordHash
            }
        });

        // Autologuear al registrar
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Usuario registrado exitosamente',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                avatar: newUser.avatar,
                points: newUser.points
            }
        });

    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// --- LOGIN ---
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Admin hardcodeado para compatibilidad visual temporal
        if (username === 'admin' && password === 'admin') {
            const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token, user: { username: 'admin', avatar: 'cat.png', points: 9999 } });
        }

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario/Correo y contraseña requeridos' });
        }

        // Buscar por usuario o por correo
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: username },
                    { email: username }
                ]
            }
        });

        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login exitoso',
            token,
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                points: user.points
            }
        });

    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Get current profile
const getProfile = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'No autorizado' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.username === 'admin') {
            return res.json({ user: { username: 'admin', avatar: 'cat.png', points: 9999 } });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, avatar: true, points: true }
        });

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        res.json({ user });
    } catch (error) {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = {
    register,
    login,
    getProfile
};
