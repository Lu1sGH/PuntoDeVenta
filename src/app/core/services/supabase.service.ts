import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

interface RuntimeSupabaseConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private supabase: SupabaseClient;
  private initPromise: Promise<void> | null = null;
  private readonly configuredSignal = signal<boolean>(false);

  constructor() {
    const isBrowser = isPlatformBrowser(this.platformId);
    this.supabase = createClient('https://placeholder.supabase.co', 'placeholder-anon-key', {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
      },
    });
  }

  /**
   * Indica si las credenciales fueron cargadas desde las variables de entorno del servidor
   */
  get isConfigured(): boolean {
    return this.configuredSignal();
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Obtiene de forma segura la configuración en tiempo de ejecución desde `/api/config`
   */
  async ensureInitialized(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.fetchRuntimeConfig();
    return this.initPromise;
  }

  private async fetchRuntimeConfig(): Promise<void> {
    try {
      if (typeof fetch !== 'function') return;

      const response = await fetch('/api/config', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) return;

      const config = (await response.json()) as RuntimeSupabaseConfig;
      const rawUrl = (config.supabaseUrl?.trim() ?? '')
        .replace(/\/rest\/v1\/?$/i, '')
        .replace(/\/+$/, '');
      const rawKey = config.supabaseAnonKey?.trim() ?? '';

      const valid =
        rawUrl.startsWith('https://') &&
        !rawUrl.includes('TU_SUPABASE_URL') &&
        !rawUrl.includes('tu-proyecto.supabase.co') &&
        rawKey.length > 20 &&
        !rawKey.includes('TU_SUPABASE_ANON_KEY');

      if (valid) {
        this.supabase = createClient(rawUrl, rawKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        this.configuredSignal.set(true);
      }
    } catch {
      // Si no hay servidor de configuración disponible (ej. tests unitarios), se mantiene en modo local
    }
  }

  /**
   * Verifica la conectividad con la base de datos de Supabase
   */
  async checkConnection(): Promise<{ ok: boolean; message: string }> {
    await this.ensureInitialized();

    if (!this.isConfigured) {
      return {
        ok: false,
        message:
          'Variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY no detectadas en el servidor.',
      };
    }

    const { error } = await this.supabase.from('categories').select('id').limit(1);
    if (error) {
      return {
        ok: false,
        message: `Error de Supabase (${error.code ?? 'DB'}): ${error.message}`,
      };
    }

    return {
      ok: true,
      message: 'Conectado a Supabase correctamente',
    };
  }
}
