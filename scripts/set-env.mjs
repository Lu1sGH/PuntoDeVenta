import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Carga variables desde un archivo .env local si existe
 */
function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const supabaseUrl = process.env['SUPABASE_URL'] || process.env['NG_APP_SUPABASE_URL'];
const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'] || process.env['NG_APP_SUPABASE_ANON_KEY'];

if (supabaseUrl && supabaseAnonKey) {
  const envDir = resolve(process.cwd(), 'src/environments');
  if (!existsSync(envDir)) {
    mkdirSync(dirname(resolve(envDir, 'environment.ts')), { recursive: true });
  }

  const prodContent = `export const environment = {
  production: true,
  supabaseUrl: '${supabaseUrl}',
  supabaseAnonKey: '${supabaseAnonKey}',
};
`;

  const devContent = `export const environment = {
  production: false,
  supabaseUrl: '${supabaseUrl}',
  supabaseAnonKey: '${supabaseAnonKey}',
};
`;

  writeFileSync(resolve(envDir, 'environment.ts'), prodContent, 'utf-8');
  writeFileSync(resolve(envDir, 'environment.development.ts'), devContent, 'utf-8');
  console.log('[set-env] Variables SUPABASE_URL y SUPABASE_ANON_KEY aplicadas en src/environments/');
} else {
  console.log(
    '[set-env] No se detectaron SUPABASE_URL / SUPABASE_ANON_KEY en variables de entorno; se mantiene src/environments/ actual.',
  );
}
