import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  CartItem,
  Category,
  CreateProductFormInput,
  CreateSalePayload,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  mxnToCents,
} from '../models/pos.models';
import { SupabaseService } from './supabase.service';

const LOCAL_PRODUCTS_KEY = 'pdv_local_products';
const LOCAL_SALES_KEY = 'pdv_local_sales';

export interface StoredSaleWithItems extends Sale {
  items: SaleItem[];
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim().length > 0) {
      return msg;
    }
  }
  return fallback;
}

@Injectable({
  providedIn: 'root',
})
export class PosService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabaseService = inject(SupabaseService);

  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly cart = signal<CartItem[]>([]);
  readonly sales = signal<StoredSaleWithItems[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly connectionStatus = signal<{ ok: boolean; message: string }>({
    ok: false,
    message: 'Verificando conexión...',
  });

  get isConfigured(): boolean {
    return this.supabaseService.isConfigured;
  }

  readonly cartSubtotal = computed(() =>
    this.cart().reduce((sum, item) => sum + item.subtotal, 0),
  );

  readonly cartTax = computed(() => 0);

  readonly cartTotal = computed(() => this.cartSubtotal());

  readonly cartItemCount = computed(() =>
    this.cart().reduce((count, item) => count + item.quantity, 0),
  );

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.products.set(this.readLocalProducts());
      this.sales.set(this.readLocalSales());
    }
  }

  private readLocalProducts(): Product[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const raw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
      return raw ? (JSON.parse(raw) as Product[]) : [];
    } catch {
      return [];
    }
  }

  private writeLocalProducts(items: Product[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(items));
    } catch {
      // Ignorar errores de cuota de almacenamiento local
    }
  }

  private readLocalSales(): StoredSaleWithItems[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const raw = localStorage.getItem(LOCAL_SALES_KEY);
      return raw ? (JSON.parse(raw) as StoredSaleWithItems[]) : [];
    } catch {
      return [];
    }
  }

  private writeLocalSales(items: StoredSaleWithItems[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(LOCAL_SALES_KEY, JSON.stringify(items));
    } catch {
      // Ignorar errores de cuota de almacenamiento local
    }
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Inicializa la conexión y carga categorías y productos desde Supabase
   */
  async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const status = await this.supabaseService.checkConnection();
      this.connectionStatus.set(status);

      if (status.ok) {
        await Promise.all([this.loadCategories(), this.loadProducts(), this.loadSales()]);
      } else {
        this.products.set(this.readLocalProducts());
        this.sales.set(this.readLocalSales());
      }
    } catch (err) {
      const message = extractErrorMessage(err, 'Error inesperado al conectar');
      this.error.set(message);
      this.connectionStatus.set({ ok: false, message });
    } finally {
      this.loading.set(false);
    }
  }

  async loadCategories(): Promise<Category[]> {
    await this.supabaseService.ensureInitialized();

    if (!this.isConfigured) {
      return this.categories();
    }

    const { data, error } = await this.supabaseService.client
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    const rows = (data ?? []) as Category[];
    this.categories.set(rows);
    return rows;
  }

  async loadProducts(): Promise<Product[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.supabaseService.ensureInitialized();

      if (!this.isConfigured) {
        if (
          isPlatformBrowser(this.platformId) &&
          localStorage.getItem(LOCAL_PRODUCTS_KEY) !== null
        ) {
          const local = this.readLocalProducts();
          this.products.set(local);
          return local;
        }
        return this.products();
      }

      const { data, error } = await this.supabaseService.client
        .from('products')
        .select('*, categories(id, name, color)')
        .order('name');

      if (error) throw error;
      const rows = (data ?? []) as Product[];
      this.products.set(rows);
      return rows;
    } catch (err) {
      const message = extractErrorMessage(err, 'Error al cargar productos');
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Carga el historial completo de ventas junto con el detalle de cada artículo vendido
   */
  async loadSales(): Promise<StoredSaleWithItems[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.supabaseService.ensureInitialized();

      if (!this.isConfigured) {
        if (
          isPlatformBrowser(this.platformId) &&
          localStorage.getItem(LOCAL_SALES_KEY) !== null
        ) {
          const local = this.readLocalSales();
          this.sales.set(local);
          return local;
        }
        return this.sales();
      }

      const { data, error } = await this.supabaseService.client
        .from('sales')
        .select('*, sale_items(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = ((data ?? []) as Array<Sale & { sale_items?: SaleItem[] }>).map((row) => ({
        ...row,
        items: Array.isArray(row.sale_items) ? row.sale_items : [],
      }));

      this.sales.set(rows);
      return rows;
    } catch (err) {
      const message = extractErrorMessage(err, 'Error al cargar el historial de ventas');
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Sube una imagen al bucket `product-images` de Supabase Storage o genera Data URL como respaldo
   */
  async uploadProductPhoto(file: File): Promise<string> {
    await this.supabaseService.ensureInitialized();

    if (!this.isConfigured) {
      return this.fileToDataUrl(file);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await this.supabaseService.client.storage
      .from('product-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (!uploadError) {
      const { data } = this.supabaseService.client.storage
        .from('product-images')
        .getPublicUrl(filePath);
      return data.publicUrl;
    }

    return this.fileToDataUrl(file);
  }

  /**
   * Crea un producto convirtiendo el precio de MXN a centavos para persistir en Supabase
   */
  async createProductFromForm(input: CreateProductFormInput): Promise<Product> {
    await this.supabaseService.ensureInitialized();

    const priceInCents = mxnToCents(input.priceMxn);
    let imageUrl: string | null = null;

    if (input.photoFile) {
      imageUrl = await this.uploadProductPhoto(input.photoFile);
    }

    const payload = {
      name: input.name.trim(),
      stock: Math.max(0, Math.trunc(Number(input.quantity) || 0)),
      price: priceInCents,
      description: input.description.trim() || null,
      image_url: imageUrl,
      active: true,
    };

    if (!this.isConfigured) {
      const created: Product = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `local-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
      };
      this.products.update((prev) => {
        const next = [...prev, created];
        this.writeLocalProducts(next);
        return next;
      });
      return created;
    }

    const { data, error } = await this.supabaseService.client
      .from('products')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    const created = data as Product;
    this.products.update((prev) => [...prev, created]);
    return created;
  }

  /**
   * Actualiza un producto existente en Supabase (guardando el precio en centavos)
   */
  async updateProductFromForm(
    productId: string,
    input: CreateProductFormInput,
    currentImageUrl: string | null = null,
  ): Promise<Product> {
    await this.supabaseService.ensureInitialized();

    const priceInCents = mxnToCents(input.priceMxn);
    let imageUrl = currentImageUrl;

    if (input.photoFile) {
      imageUrl = await this.uploadProductPhoto(input.photoFile);
    }

    const payload = {
      name: input.name.trim(),
      stock: Math.max(0, Math.trunc(Number(input.quantity) || 0)),
      price: priceInCents,
      description: input.description.trim() || null,
      image_url: imageUrl,
    };

    if (!this.isConfigured) {
      let updatedProduct: Product | null = null;
      this.products.update((prev) => {
        const next = prev.map((item) => {
          if (item.id !== productId) return item;
          updatedProduct = { ...item, ...payload, updated_at: new Date().toISOString() };
          return updatedProduct;
        });
        this.writeLocalProducts(next);
        return next;
      });
      if (!updatedProduct) {
        throw new Error('Producto no encontrado');
      }
      return updatedProduct;
    }

    const { data, error } = await this.supabaseService.client
      .from('products')
      .update(payload)
      .eq('id', productId)
      .select('*')
      .single();

    if (error) throw error;
    const updated = data as Product;
    this.products.update((prev) =>
      prev.map((item) => (item.id === productId ? updated : item)),
    );
    return updated;
  }

  /**
   * Elimina permanentemente un producto cuando el usuario presiona el botón de bote de basura
   */
  async deleteProduct(productId: string): Promise<void> {
    await this.supabaseService.ensureInitialized();

    if (!this.isConfigured) {
      this.products.update((prev) => {
        const next = prev.filter((item) => item.id !== productId);
        this.writeLocalProducts(next);
        return next;
      });
      this.removeFromCart(productId);
      return;
    }

    const { error } = await this.supabaseService.client
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;

    this.products.update((prev) => prev.filter((item) => item.id !== productId));
    this.removeFromCart(productId);
  }

  /**
   * Elimina todos los registros de la base de datos (Supabase y almacenamiento local)
   */
  async clearDatabase(): Promise<void> {
    await this.supabaseService.ensureInitialized();

    if (this.isConfigured) {
      const { error: rpcError } = await this.supabaseService.client.rpc(
        'reset_pos_database',
      );

      if (rpcError) {
        const zeroUuid = '00000000-0000-0000-0000-000000000000';
        await this.supabaseService.client
          .from('sale_items')
          .delete()
          .neq('id', zeroUuid);
        await this.supabaseService.client.from('sales').delete().neq('id', zeroUuid);

        const { error: prodErr } = await this.supabaseService.client
          .from('products')
          .delete()
          .neq('id', zeroUuid);
        if (prodErr) throw prodErr;

        await this.supabaseService.client
          .from('customers')
          .delete()
          .neq('id', zeroUuid);
        await this.supabaseService.client
          .from('categories')
          .delete()
          .neq('id', zeroUuid);
      }
    }

    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(LOCAL_PRODUCTS_KEY);
      localStorage.removeItem(LOCAL_SALES_KEY);
    }

    this.products.set([]);
    this.categories.set([]);
    this.cart.set([]);
    this.sales.set([]);
  }

  /**
   * Obtiene la cantidad de un producto que ya está agregada en el carrito
   */
  getCartQuantity(productId: string): number {
    return this.cart().find((item) => item.product.id === productId)?.quantity ?? 0;
  }

  /**
   * Verifica si aún hay existencia disponible para agregar más unidades de este producto al carrito
   */
  canAddToCart(product: Product): boolean {
    return product.stock > 0 && this.getCartQuantity(product.id) < product.stock;
  }

  /**
   * Agrega un producto al carrito verificando que exista stock disponible
   */
  addToCart(product: Product, quantity = 1): boolean {
    if (quantity <= 0 || product.stock <= 0) {
      return false;
    }

    const currentQty = this.getCartQuantity(product.id);
    if (currentQty + quantity > product.stock) {
      return false;
    }

    this.cart.update((items) => {
      const existingIndex = items.findIndex((i) => i.product.id === product.id);
      if (existingIndex > -1) {
        return items.map((item, idx) => {
          if (idx !== existingIndex) return item;
          const nextQty = Math.min(item.quantity + quantity, product.stock);
          return {
            ...item,
            product,
            quantity: nextQty,
            subtotal: nextQty * product.price,
          };
        });
      }

      return [
        ...items,
        {
          product,
          quantity,
          subtotal: quantity * product.price,
        },
      ];
    });

    return true;
  }

  /**
   * Actualiza la cantidad de un producto en el carrito mediante el campo numérico,
   * respetando el límite de existencia disponible (1 .. stock)
   */
  updateCartItemQuantity(productId: string, newQuantity: number): void {
    const parsed = Math.trunc(Number(newQuantity));
    if (Number.isNaN(parsed) || parsed < 1) {
      this.updateCartItemClamp(productId, 1);
      return;
    }
    this.updateCartItemClamp(productId, parsed);
  }

  private updateCartItemClamp(productId: string, requestedQty: number): void {
    this.cart.update((items) =>
      items.map((item) => {
        if (item.product.id !== productId) return item;
        const maxStock = Math.max(1, item.product.stock);
        const clampedQty = Math.min(Math.max(1, requestedQty), maxStock);
        return {
          ...item,
          quantity: clampedQty,
          subtotal: clampedQty * item.product.price,
        };
      }),
    );
  }

  removeFromCart(productId: string): void {
    this.cart.update((items) => items.filter((item) => item.product.id !== productId));
  }

  clearCart(): void {
    this.cart.set([]);
  }

  /**
   * Registra una venta con todos sus detalles (incluyendo fecha y hora) y descuenta el inventario
   */
  async registerSale(
    paymentMethod: PaymentMethod = 'cash',
    amountReceivedCents?: number,
    options?: { discountCents?: number; customerId?: string | null; notes?: string | null },
  ): Promise<Sale> {
    await this.supabaseService.ensureInitialized();

    const items = this.cart();
    if (items.length === 0) {
      throw new Error('El carrito está vacío');
    }

    // Verificar existencia actual antes de procesar la venta
    for (const item of items) {
      const latestProduct = this.products().find((p) => p.id === item.product.id) ?? item.product;
      if (latestProduct.stock < item.quantity) {
        throw new Error(
          `Existencia insuficiente para "${item.product.name}" (Disponible: ${latestProduct.stock}).`,
        );
      }
    }

    const discount = options?.discountCents ?? 0;
    const subtotal = this.cartSubtotal();
    const tax = this.cartTax();
    const total = Math.max(0, subtotal + tax - discount);
    const received = amountReceivedCents ?? total;
    if (received < 0) {
      throw new Error('No se permiten montos negativos.');
    }
    if (received < total) {
      throw new Error('El monto recibido no puede ser menor al total a pagar.');
    }
    const changeAmount = Math.max(0, received - total);
    const createdAtIso = new Date().toISOString();

    const payload: CreateSalePayload = {
      paymentMethod,
      subtotal,
      tax,
      discount,
      total,
      amountReceived: received,
      changeAmount,
      customerId: options?.customerId ?? null,
      notes: options?.notes ?? null,
      items: items.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
      })),
    };

    if (!this.isConfigured) {
      const localSales = this.readLocalSales();
      const nextTicket = localSales.length + 1;
      const saleId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `sale-${Date.now()}`;

      const newSale: StoredSaleWithItems = {
        id: saleId,
        ticket_number: nextTicket,
        customer_id: payload.customerId ?? null,
        user_id: null,
        subtotal: payload.subtotal,
        tax: payload.tax,
        discount: payload.discount,
        total: payload.total,
        payment_method: payload.paymentMethod,
        amount_received: payload.amountReceived,
        change_amount: payload.changeAmount,
        status: 'completed',
        notes: payload.notes ?? null,
        created_at: createdAtIso,
        items: payload.items.map((i) => ({
          sale_id: saleId,
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.quantity * i.unit_price,
        })),
      };

      const updatedSales = [newSale, ...localSales];
      this.writeLocalSales(updatedSales);
      this.sales.set(updatedSales);

      this.products.update((prev) => {
        const next = prev.map((prod) => {
          const soldItem = items.find((i) => i.product.id === prod.id);
          if (!soldItem) return prod;
          return {
            ...prod,
            stock: Math.max(0, prod.stock - soldItem.quantity),
            updated_at: createdAtIso,
          };
        });
        this.writeLocalProducts(next);
        return next;
      });

      this.clearCart();
      return newSale;
    }

    const { data, error } = await this.supabaseService.client.rpc('create_pos_sale', {
      p_payment_method: payload.paymentMethod,
      p_subtotal: payload.subtotal,
      p_tax: payload.tax,
      p_discount: payload.discount,
      p_total: payload.total,
      p_amount_received: payload.amountReceived,
      p_change_amount: payload.changeAmount,
      p_items: payload.items,
      p_customer_id: payload.customerId,
      p_notes: payload.notes,
    });

    if (!error && data) {
      this.clearCart();
      await Promise.all([this.loadProducts(), this.loadSales()]);
      return data as Sale;
    }

    // Respaldo directo en tablas si la función RPC aún no fue creada en Supabase
    const { data: insertedSale, error: saleError } = await this.supabaseService.client
      .from('sales')
      .insert({
        customer_id: payload.customerId,
        subtotal: payload.subtotal,
        tax: payload.tax,
        discount: payload.discount,
        total: payload.total,
        payment_method: payload.paymentMethod,
        amount_received: payload.amountReceived,
        change_amount: payload.changeAmount,
        status: 'completed',
        notes: payload.notes,
        created_at: createdAtIso,
      })
      .select('*')
      .single();

    if (saleError) throw saleError;
    const saleRecord = insertedSale as Sale;

    const saleItemsRows = payload.items.map((i) => ({
      sale_id: saleRecord.id,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      subtotal: i.quantity * i.unit_price,
      created_at: createdAtIso,
    }));

    const { error: itemsError } = await this.supabaseService.client
      .from('sale_items')
      .insert(saleItemsRows);

    if (itemsError) throw itemsError;

    for (const item of items) {
      const nextStock = Math.max(0, item.product.stock - item.quantity);
      const { error: stockErr } = await this.supabaseService.client
        .from('products')
        .update({ stock: nextStock })
        .eq('id', item.product.id);
      if (stockErr) throw stockErr;
    }

    this.clearCart();
    await Promise.all([this.loadProducts(), this.loadSales()]);
    return saleRecord;
  }
}
