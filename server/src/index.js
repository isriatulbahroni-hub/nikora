import { getVillaWorld } from '../../game/src/villa-layout.js';
import { createGameServer } from './server.js';

// WORLD=villa -> NIKORA Wedding Villa (dinding, kolam, perabot menghalangi; tanpa kursi aula)
// (default)   -> aula resepsi
const port = Number(process.env.PORT) || 8080;
const villa = process.env.WORLD === 'villa';
const roomRules = villa ? { world: getVillaWorld(), maxPlayers: 100 } : {};
createGameServer({ port, roomRules, log: (m) => console.log(new Date().toISOString(), m) });
console.log(`ORBIT multiplayer server listening on :${port} (world: ${villa ? 'villa' : 'hall'})`);
