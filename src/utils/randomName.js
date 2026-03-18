const adjectives = ['Veloz', 'Sigiloso', 'Astuto', 'Valiente', 'Misterioso', 'Rápido', 'Lento', 'Fuerte', 'Genial', 'Loco'];
const nouns = ['Impostor', 'Tripulante', 'Piloto', 'Capitán', 'Ingeniero', 'Doctor', 'Detective', 'Fantasma', 'Robot', 'Alien'];

function generateRandomName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

module.exports = generateRandomName;
