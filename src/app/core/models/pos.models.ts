export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type SaleStatus = 'completed' | 'cancelled';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  created_at?: string;
}

export interface Product {
  id: string;
  category_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  name: string;
  description: string | null;
  /** Precio almacenado en centavos (ej. $25.50 MXN = 2550) */
  price: number;
  /** Cantidad disponible en inventario */
  stock: number;
  min_stock?: number;
  image_url: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  categories?: Pick<Category, 'id' | 'name' | 'color'> | null;
}

export interface CreateProductFormInput {
  name: string;
  quantity: number;
  priceMxn: number;
  description: string;
  photoFile?: File | null;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  created_at?: string;
}

export interface Sale {
  id: string;
  ticket_number: number;
  customer_id: string | null;
  user_id: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_received: number;
  change_amount: number;
  status: SaleStatus;
  notes: string | null;
  created_at: string;
}

export interface SaleItem {
  id?: string;
  sale_id?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  subtotal: number;
}

export interface CreateSalePayload {
  paymentMethod: PaymentMethod;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountReceived: number;
  changeAmount: number;
  customerId?: string | null;
  notes?: string | null;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }>;
}

/**
 * Convierte un monto en pesos mexicanos (MXN) a centavos enteros
 */
export function mxnToCents(amountMxn: number): number {
  return Math.round((Number(amountMxn) || 0) * 100);
}

/**
 * Convierte un monto en centavos a pesos mexicanos (MXN)
 */
export function centsToMxn(amountCents: number): number {
  return (Number(amountCents) || 0) / 100;
}
