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
import { Product, centsToMxn, mxnToCents } from '../../core/models/pos.models';
import { PosService, extractErrorMessage } from '../../core/services/pos.service';

@Component({
  selector: 'app-make-sale',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './make-sale.html',
  styleUrl: './make-sale.css',
})
export class MakeSaleComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly posService = inject(PosService);

  protected readonly searchQuery = signal('');
  protected readonly showTicketModal = signal(false);
  protected readonly ticketDate = signal<Date>(new Date());
  protected readonly amountReceivedMxn = signal<number | string | null>(null);
  protected readonly processingSale = signal(false);
  protected readonly statusMessage = signal<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /**
   * Indica si el usuario ya ingresó un monto numérico en el ticket
   */
  protected readonly hasEnteredAmount = computed(() => {
    const raw = this.amountReceivedMxn();
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return false;
    }
    const parsed = Number(raw);
    return !Number.isNaN(parsed);
  });

  /**
   * Monto recibido convertido a centavos (nunca negativo)
   */
  protected readonly amountReceivedCents = computed(() => {
    if (!this.hasEnteredAmount()) {
      return 0;
    }
    const parsed = Number(this.amountReceivedMxn());
    if (Number.isNaN(parsed) || parsed < 0) {
      return 0;
    }
    return mxnToCents(parsed);
  });

  /**
   * Regla de negocio: no se puede pagar con una menor cantidad de dinero ni con números negativos
   */
  protected readonly isPaymentSufficient = computed(() => {
    if (!this.hasEnteredAmount()) {
      return false;
    }
    const parsed = Number(this.amountReceivedMxn());
    if (Number.isNaN(parsed) || parsed < 0) {
      return false;
    }
    return this.amountReceivedCents() >= this.posService.cartTotal();
  });

  /**
   * Monto faltante en centavos cuando el monto ingresado es menor al total
   */
  protected readonly missingAmountCents = computed(() => {
    if (!this.hasEnteredAmount()) {
      return 0;
    }
    return Math.max(0, this.posService.cartTotal() - this.amountReceivedCents());
  });

  /**
   * Cambio calculado automáticamente cuando el monto ingresado cubre el total
   */
  protected readonly changeCents = computed(() => {
    if (!this.isPaymentSufficient()) {
      return 0;
    }
    return Math.max(0, this.amountReceivedCents() - this.posService.cartTotal());
  });

  /**
   * Resultados filtrados al escribir en la barra de búsqueda
   */
  protected readonly searchResults = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return [];
    }

    return this.posService
      .products()
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          (product.description?.toLowerCase().includes(query) ?? false),
      );
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      void this.posService.loadProducts().catch(() => {
        // Error registrado en posService.error
      });
    }
  }

  protected formatPriceMxn(priceCents: number): number {
    return centsToMxn(priceCents);
  }

  /**
   * Impide teclear signos negativos o notación científica en el campo de monto recibido
   */
  protected preventNegativeKey(event: KeyboardEvent): void {
    if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  }

  /**
   * Actualiza el monto recibido bloqueando cualquier valor negativo
   */
  protected onAmountReceivedChange(
    rawValue: number | string | null,
    inputElement?: HTMLInputElement,
  ): void {
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
      this.amountReceivedMxn.set(null);
      return;
    }

    const parsed = Number(rawValue);
    if (Number.isNaN(parsed) || parsed < 0) {
      this.amountReceivedMxn.set(0);
      if (inputElement) {
        inputElement.value = '0';
      }
      return;
    }

    this.amountReceivedMxn.set(rawValue);
  }

  /**
   * Cantidad restante que aún se puede agregar al carrito según la existencia del producto
   */
  protected remainingStock(product: Product): number {
    return Math.max(0, product.stock - this.posService.getCartQuantity(product.id));
  }

  /**
   * Determina si el producto está agotado (en inventario o porque ya se agregaron todas las existencias al carrito)
   */
  protected isOutOfStock(product: Product): boolean {
    return product.stock <= 0 || this.remainingStock(product) <= 0;
  }

  protected addProductToCart(product: Product): void {
    this.statusMessage.set(null);

    if (this.isOutOfStock(product)) {
      this.statusMessage.set({
        type: 'error',
        text: `No hay más existencia disponible de "${product.name}".`,
      });
      return;
    }

    this.posService.addToCart(product, 1);
  }

  protected onQuantityChange(productId: string, rawValue: number | string): void {
    this.statusMessage.set(null);
    const numericValue = Number(rawValue);
    this.posService.updateCartItemQuantity(productId, numericValue);
  }

  protected removeItem(productId: string): void {
    this.statusMessage.set(null);
    this.posService.removeFromCart(productId);
  }

  protected cancelSale(): void {
    this.statusMessage.set(null);
    this.showTicketModal.set(false);
    this.amountReceivedMxn.set(null);
    this.posService.clearCart();
  }

  protected openTicketModal(): void {
    this.statusMessage.set(null);
    if (this.posService.cart().length === 0) {
      return;
    }
    this.ticketDate.set(new Date());
    this.amountReceivedMxn.set(null);
    this.showTicketModal.set(true);
  }

  /**
   * Cierra el pop up del ticket sin eliminar nada del carrito de compras
   */
  protected closeTicketModal(): void {
    if (this.processingSale()) return;
    this.showTicketModal.set(false);
  }

  protected async finalizePurchase(): Promise<void> {
    if (
      this.posService.cart().length === 0 ||
      this.processingSale() ||
      !this.isPaymentSufficient()
    ) {
      return;
    }

    this.processingSale.set(true);
    this.statusMessage.set(null);

    try {
      const receivedCents = this.amountReceivedCents();
      const changeMxn = this.formatPriceMxn(this.changeCents());
      const sale = await this.posService.registerSale('cash', receivedCents);
      this.showTicketModal.set(false);
      this.amountReceivedMxn.set(null);
      this.searchQuery.set('');
      this.statusMessage.set({
        type: 'success',
        text: `Compra #${sale.ticket_number} finalizada correctamente. Cambio entregado: $${changeMxn.toFixed(2)} MXN.`,
      });
    } catch (err) {
      this.statusMessage.set({
        type: 'error',
        text: extractErrorMessage(err, 'No se pudo finalizar la compra.'),
      });
    } finally {
      this.processingSale.set(false);
    }
  }
}
