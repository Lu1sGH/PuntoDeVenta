import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase: SupabaseClient;

  /**
   * Indica si las credenciales de Supabase ya fueron configuradas con valores reales
   */
  readonly isConfigured: boolean;

  constructor() {
    const isBrowser = isPlatformBrowser(this.platformId);
    const rawUrl = (environment.supabaseUrl?.trim() ?? '')
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
    const rawKey = environment.supabaseAnonKey?.trim() ?? '';

    this.isConfigured =
      rawUrl.startsWith('https://') &&
      !rawUrl.includes('TU_SUPABASE_URL') &&
      !rawUrl.includes('tu-proyecto.supabase.co') &&
      rawKey.length > 20 &&
      !rawKey.includes('TU_SUPABASE_ANON_KEY');

    const safeUrl = this.isConfigured ? rawUrl : 'https://placeholder.supabase.co';
    const safeKey = this.isConfigured ? rawKey : 'placeholder-anon-key';

    this.supabase = createClient(safeUrl, safeKey, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
      },
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Verifica la conectividad con la base de datos de Supabase
   */
  async checkConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured) {
      return {
        ok: false,
        message:
          'Credenciales pendientes: configura SUPABASE_URL y SUPABASE_ANON_KEY en .env o en src/environments/environment.ts',
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
