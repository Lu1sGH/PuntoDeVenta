import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import {
  getAllowedHosts,
  getContext,
  getTrustProxyHeaders,
} from '@netlify/angular-runtime/app-engine.js';

const angularAppEngine = new AngularAppEngine({
  allowedHosts: getAllowedHosts(),
  trustProxyHeaders: getTrustProxyHeaders(),
});

let dotEnvLoaded = false;

/**
 * Obtiene una variable de entorno en tiempo de ejecución desde Netlify Edge, Deno o Node (.env)
 * sin inyectarla durante el empaquetado.
 */
function getRuntimeEnv(key: string): string {
  if (
    !dotEnvLoaded &&
    typeof process !== 'undefined' &&
    typeof (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function'
  ) {
    dotEnvLoaded = true;
    try {
      (process as { loadEnvFile: (path?: string) => void }).loadEnvFile('.env');
    } catch {
      // Si no existe archivo .env local, continuar con las variables del sistema
    }
  }

  const runtimeGlobal = globalThis as {
    Netlify?: { env?: { get?: (name: string) => string | undefined } };
    Deno?: { env?: { get?: (name: string) => string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };

  const value =
    runtimeGlobal.Netlify?.env?.get?.(key) ??
    runtimeGlobal.Deno?.env?.get?.(key) ??
    runtimeGlobal.process?.env?.[key] ??
    '';

  return value.trim();
}

export async function netlifyAppEngineHandler(request: Request): Promise<Response> {
  const context = getContext();
  const pathname = new URL(request.url).pathname;

  if (pathname === '/api/config') {
    const rawUrl =
      getRuntimeEnv('SUPABASE_URL') || getRuntimeEnv('NG_APP_SUPABASE_URL');
    const supabaseUrl = rawUrl
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
    const supabaseAnonKey =
      getRuntimeEnv('SUPABASE_ANON_KEY') || getRuntimeEnv('NG_APP_SUPABASE_ANON_KEY');

    return Response.json(
      {
        supabaseUrl,
        supabaseAnonKey,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }

  const result = await angularAppEngine.handle(request, context);
  return result || new Response('Not found', { status: 404 });
}

/**
 * Manejador de peticiones utilizado por Angular CLI (dev-server y build) y Netlify.
 */
export const reqHandler = createRequestHandler(netlifyAppEngineHandler);
