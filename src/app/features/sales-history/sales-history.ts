import { CurrencyPipe, DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentMethod, centsToMxn } from '../../core/models/pos.models';
import { PosService, StoredSaleWithItems } from '../../core/services/pos.service';

export type SalesPeriodFilter =
  | 'today'
  | 'yesterday'
  | 'last_week'
  | 'last_month'
  | 'last_3_months'
  | 'custom';

export interface ProductSalesBreakdown {
  key: string;
  productId: string | null;
  productName: string;
  imageUrl: string | null;
  quantitySold: number;
  revenueCents: number;
}

@Component({
  selector: 'app-sales-history',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './sales-history.html',
  styleUrl: './sales-history.css',
})
export class SalesHistoryComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly posService = inject(PosService);

  protected readonly selectedPeriod = signal<SalesPeriodFilter>('today');
  protected readonly customStartDate = signal<string>(this.formatDateInput(new Date()));
  protected readonly customEndDate = signal<string>(this.formatDateInput(new Date()));
  protected readonly selectedTicket = signal<StoredSaleWithItems | null>(null);

  protected readonly periodOptions: Array<{ value: SalesPeriodFilter; label: string }> = [
    { value: 'today', label: 'Hoy' },
    { value: 'yesterday', label: 'Ayer' },
    { value: 'last_week', label: 'Última semana' },
    { value: 'last_month', label: 'Último mes' },
    { value: 'last_3_months', label: 'Últimos 3 meses' },
    { value: 'custom', label: 'Periodo que se quiera determinar' },
  ];

  /**
   * Ventas filtradas según el periodo seleccionado
   */
  protected readonly filteredSales = computed(() => {
    const allSales = this.posService.sales();
    const period = this.selectedPeriod();
    const { start, end } = this.getDateBounds(
      period,
      this.customStartDate(),
      this.customEndDate(),
    );

    return allSales.filter((sale) => {
      const saleTime = new Date(sale.created_at).getTime();
      if (Number.isNaN(saleTime)) return false;
      return saleTime >= start.getTime() && saleTime <= end.getTime();
    });
  });

  /**
   * Total monetario vendido en el periodo (en centavos)
   */
  protected readonly totalRevenueCents = computed(() =>
    this.filteredSales().reduce((sum, sale) => sum + (Number(sale.total) || 0), 0),
  );

  /**
   * Total de unidades de productos vendidas en el periodo
   */
  protected readonly totalProductsSold = computed(() =>
    this.filteredSales().reduce(
      (sum, sale) => sum + this.getTicketItemCount(sale),
      0,
    ),
  );

  /**
   * Ticket promedio en centavos
   */
  protected readonly averageTicketCents = computed(() => {
    const count = this.filteredSales().length;
    return count > 0 ? Math.round(this.totalRevenueCents() / count) : 0;
  });

  /**
   * Desglose de qué cantidad de cada producto se ha vendido en el periodo seleccionado
   */
  protected readonly productBreakdown = computed<ProductSalesBreakdown[]>(() => {
    const map = new Map<string, ProductSalesBreakdown>();

    for (const sale of this.filteredSales()) {
      for (const item of sale.items ?? []) {
        const key = item.product_id || item.product_name;
        const current = map.get(key);
        const lineRevenue = Number(item.subtotal) || item.quantity * item.unit_price;

        if (current) {
          current.quantitySold += Number(item.quantity) || 0;
          current.revenueCents += lineRevenue;
          if (!current.imageUrl) {
            current.imageUrl = this.getProductImage(item.product_id, item.product_name);
          }
        } else {
          map.set(key, {
            key,
            productId: item.product_id ?? null,
            productName: item.product_name,
            imageUrl: this.getProductImage(item.product_id, item.product_name),
            quantitySold: Number(item.quantity) || 0,
            revenueCents: lineRevenue,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.quantitySold - a.quantitySold);
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      void Promise.all([
        this.posService.loadProducts(),
        this.posService.loadSales(),
      ]).catch(() => {
        // Error registrado en posService.error
      });
    }
  }

  protected getProductImage(
    productId?: string | null,
    productName?: string | null,
  ): string | null {
    const products = this.posService.products();
    if (productId) {
      const byId = products.find((p) => p.id === productId);
      if (byId?.image_url) return byId.image_url;
    }
    if (productName) {
      const normalized = productName.trim().toLowerCase();
      const byName = products.find((p) => p.name.trim().toLowerCase() === normalized);
      if (byName?.image_url) return byName.image_url;
    }
    return null;
  }

  protected selectPeriod(period: SalesPeriodFilter): void {
    this.selectedPeriod.set(period);
  }

  protected formatPriceMxn(cents: number): number {
    return centsToMxn(cents);
  }

  protected getTicketItemCount(sale: StoredSaleWithItems): number {
    return (sale.items ?? []).reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  }

  protected formatPaymentMethod(method: PaymentMethod): string {
    switch (method) {
      case 'cash':
        return 'Efectivo';
      case 'card':
        return 'Tarjeta';
      case 'transfer':
        return 'Transferencia';
      default:
        return method;
    }
  }

  protected openTicketDetails(sale: StoredSaleWithItems): void {
    this.selectedTicket.set(sale);
  }

  protected closeTicketDetails(): void {
    this.selectedTicket.set(null);
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDateBounds(
    period: SalesPeriodFilter,
    customStartStr: string,
    customEndStr: string,
  ): { start: Date; end: Date } {
    const now = new Date();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    if (period === 'today') {
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      return { start: startOfToday, end: endOfToday };
    }

    if (period === 'yesterday') {
      const startOfYesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
        0,
        0,
        0,
        0,
      );
      const endOfYesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
        23,
        59,
        59,
        999,
      );
      return { start: startOfYesterday, end: endOfYesterday };
    }

    if (period === 'last_week') {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 7,
        0,
        0,
        0,
        0,
      );
      return { start, end: endOfToday };
    }

    if (period === 'last_month') {
      const start = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      return { start, end: endOfToday };
    }

    if (period === 'last_3_months') {
      const start = new Date(
        now.getFullYear(),
        now.getMonth() - 3,
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      return { start, end: endOfToday };
    }

    // Periodo personalizado
    const [sYear, sMonth, sDay] = customStartStr.split('-').map(Number);
    const [eYear, eMonth, eDay] = customEndStr.split('-').map(Number);

    const start =
      sYear && sMonth && sDay
        ? new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0)
        : new Date(0);
    const end =
      eYear && eMonth && eDay
        ? new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999)
        : endOfToday;

    return { start, end };
  }
}
