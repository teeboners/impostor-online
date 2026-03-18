const wordList = [
    {
        category: 'Animales',
        entries: [
            { word: 'Elefante', clues: ['Trompa', 'Gris', 'Grande', 'África'] },
            { word: 'Jirafa', clues: ['Cuello', 'Alto', 'África', 'Manchas'] },
            { word: 'Perro', clues: ['Ladrido', 'Mascota', 'Leal', 'Hueso'] },
            { word: 'Gato', clues: ['Maullido', 'Mascota', 'Ágil', 'Bigotes'] },
            { word: 'León', clues: ['Rey', 'Selva', 'Melena', 'Rugido'] },
            { word: 'Tigre', clues: ['Rayas', 'Selva', 'Felino', 'Cazador'] },
            { word: 'Mono', clues: ['Banana', 'Selva', 'Árbol', 'Inteligente'] },
            { word: 'Delfín', clues: ['Mar', 'Salto', 'Inteligente', 'Mamífero'] },
            { word: 'Águila', clues: ['Vuelo', 'Cima', 'Visión', 'Plumas'] },
            { word: 'Pingüino', clues: ['Frío', 'Hielo', 'Vuelo no', 'Blanco'] }
        ]
    },
    {
        category: 'Comida',
        entries: [
            { word: 'Pizza', clues: ['Italia', 'Queso', 'Masa', 'Cena'] },
            { word: 'Hamburguesa', clues: ['Pan', 'Carne', 'Fast food', 'Combo'] },
            { word: 'Sushi', clues: ['Japón', 'Arroz', 'Pescado', 'Palillos'] },
            { word: 'Tacos', clues: ['México', 'Picante', 'Tortilla', 'Cena'] },
            { word: 'Helado', clues: ['Frío', 'Postre', 'Cucurucho', 'Dulce'] },
            { word: 'Chocolate', clues: ['Dulce', 'Cacao', 'Barra', 'Marrón'] },
            { word: 'Manzana', clues: ['Fruta', 'Roja', 'Árbol', 'Sana'] },
            { word: 'Pan', clues: ['Harina', 'Horno', 'Blanco', 'Desayuno'] },
            { word: 'Queso', clues: ['Leche', 'Amarillo', 'Ratón', 'Sándwich'] },
            { word: 'Pollo', clues: ['Ave', 'Granja', 'Huevo', 'Asado'] }
        ]
    },
    {
        category: 'Objetos',
        entries: [
            { word: 'Mesa', clues: ['Madera', 'Comedor', 'Patas', 'Apoyar'] },
            { word: 'Silla', clues: ['Sentarse', 'Madera', 'Mesa', 'Comodidad'] },
            { word: 'Computadora', clues: ['Internet', 'Teclado', 'Pantalla', 'Oficina'] },
            { word: 'Teléfono', clues: ['Llamada', 'Bolsillo', 'Pantalla', 'Smart'] },
            { word: 'Lápiz', clues: ['Escribir', 'Gris', 'Papel', 'Dibujo'] },
            { word: 'Reloj', clues: ['Tiempo', 'Muñeca', 'Hora', 'Tic tac'] },
            { word: 'Cama', clues: ['Dormir', 'Noche', 'Sábana', 'Almohada'] },
            { word: 'Coche', clues: ['Ruedas', 'Motor', 'Camino', 'Viajar'] },
            { word: 'Bicicleta', clues: ['Ruedas', 'Pedal', 'Cadena', 'Deporte'] },
            { word: 'Libro', clues: ['Lectura', 'Páginas', 'Historia', 'Papel'] }
        ]
    }
];

function getRandomWord() {
    const category = wordList[Math.floor(Math.random() * wordList.length)];
    const entry = category.entries[Math.floor(Math.random() * category.entries.length)];
    return {
        category: category.category,
        word: entry.word,
        clues: entry.clues,
        allCluesInCategory: category.entries.flatMap(e => e.clues)
    };
}

module.exports = { getRandomWord, wordList };
