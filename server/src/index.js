import { createGameServer } from './server.js';

const port = Number(process.env.PORT) || 8080;
createGameServer({ port, log: (m) => console.log(new Date().toISOString(), m) });
console.log(`ORBIT multiplayer server listening on :${port}`);
