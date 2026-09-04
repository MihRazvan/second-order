import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
await sql.end();
console.log('migrations applied');
