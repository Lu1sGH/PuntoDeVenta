import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { mxnToCents } from './core/models/pos.models';
import { PosService } from './core/services/pos.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navbar options and settings gear button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';

    expect(text).toContain('Inventario');
    expect(text).toContain('Agregar productos');
    expect(text).toContain('Realizar venta');
    expect(text).toContain('Historial de ventas');
    expect(compiled.querySelector('button[aria-label="Configuraciones"]')).toBeTruthy();
    expect(compiled.querySelector('button[aria-label="Menú de navegación"]')).toBeTruthy();

    // Verificar apertura del hamburger menu en vista móvil
    const hamburgerBtn = compiled.querySelector(
      'button[aria-label="Menú de navegación"]',
    ) as HTMLButtonElement;
    hamburgerBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(compiled.querySelector('#mobile-nav-menu')).toBeTruthy();
  });

  it('should display available products table, highlight out-of-stock rows in light red, and open popup with 3 top buttons on row click', async () => {
    const fixture = TestBed.createComponent(App);
    const posService = TestBed.inject(PosService);

    posService.products.set([
      {
        id: 'prod-1',
        name: 'Agua Natural 600ml',
        description: 'Botella de agua purificada',
        price: 1500,
        stock: 10,
        image_url: null,
      },
      {
        id: 'prod-2',
        name: 'Galletas de Chocolate',
        description: 'Paquete de 6 galletas',
        price: 2850,
        stock: 0,
        image_url: null,
      },
    ]);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tr.product-row');
    expect(rows.length).toBe(2);

    expect(rows[0].classList.contains('out-of-stock')).toBe(false);
    expect(rows[1].classList.contains('out-of-stock')).toBe(true);

    (rows[0] as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('[role="dialog"]')).toBeTruthy();
    expect(compiled.querySelector('button[aria-label="Eliminar producto"]')).toBeTruthy();
    expect(compiled.querySelector('button[aria-label="Editar producto"]')).toBeTruthy();
    expect(compiled.querySelector('button[aria-label="Cerrar"]')).toBeTruthy();
  });

  it('should display add-product form without centavos message when selecting Agregar productos', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const addTabBtn = Array.from(compiled.querySelectorAll('button.nav-item')).find((btn) =>
      btn.textContent?.includes('Agregar productos'),
    ) as HTMLButtonElement;

    addTabBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('#product-name')).toBeTruthy();
    expect(compiled.querySelector('#product-quantity')).toBeTruthy();
    expect(compiled.querySelector('#product-price')).toBeTruthy();
    expect(compiled.querySelector('#product-description')).toBeTruthy();
    expect(compiled.querySelector('#product-photo')).toBeTruthy();
    expect(compiled.textContent).not.toContain('centavos');
  });

  it('should search products, add to cart respecting stock, open ticket popup without clearing on X, and clear on Cancelar', async () => {
    const fixture = TestBed.createComponent(App);
    const posService = TestBed.inject(PosService);

    posService.products.set([
      {
        id: 'prod-1',
        name: 'Café Americano',
        description: 'Café caliente',
        price: 3500,
        stock: 2,
        image_url: null,
      },
      {
        id: 'prod-2',
        name: 'Papas Clásicas',
        description: 'Botana salada',
        price: 2200,
        stock: 0,
        image_url: null,
      },
    ]);

    const compiled = fixture.nativeElement as HTMLElement;
    const saleTabBtn = Array.from(compiled.querySelectorAll('button.nav-item')).find((btn) =>
      btn.textContent?.includes('Realizar venta'),
    ) as HTMLButtonElement;

    saleTabBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const searchInput = compiled.querySelector('#sale-search-input') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    searchInput.value = 'a';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    const resultItems = compiled.querySelectorAll('.search-result-item');
    expect(resultItems.length).toBe(2);
    expect(resultItems[0].querySelector('.btn-add-plus')).toBeTruthy();
    expect(resultItems[1].classList.contains('out-of-stock')).toBe(true);
    expect(resultItems[1].textContent).toContain('Agotado');

    const plusBtn = resultItems[0].querySelector('.btn-add-plus') as HTMLButtonElement;
    plusBtn.click();
    plusBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(posService.cart().length).toBe(1);
    expect(posService.cart()[0].quantity).toBe(2);
    expect(posService.cartTotal()).toBe(7000);

    const completeBtn = compiled.querySelector('.btn-complete-sale') as HTMLButtonElement;
    completeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.ticket-dialog')).toBeTruthy();
    expect(compiled.textContent).toContain('Finalizar compra');

    const finalizeBtn = compiled.querySelector('.btn-finalize-purchase') as HTMLButtonElement;
    const amountInput = compiled.querySelector('#ticket-amount-received') as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    // Sin monto ingresado aún, no se puede finalizar la compra
    expect(finalizeBtn.disabled).toBe(true);

    // Ingresar monto menor al total ($50.00 < $70.00) -> bloqueado
    amountInput.value = '50';
    amountInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(finalizeBtn.disabled).toBe(true);
    expect(compiled.textContent).toContain('El monto recibido no puede ser menor al total a pagar');

    // Intentar ingresar monto negativo -> se corrige a 0 y permanece bloqueado
    amountInput.value = '-20';
    amountInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(Number(amountInput.value)).toBeGreaterThanOrEqual(0);
    expect(finalizeBtn.disabled).toBe(true);

    // Ingresar monto válido mayor al total ($100.00 para total de $70.00 -> cambio $30.00)
    amountInput.value = '100';
    amountInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(finalizeBtn.disabled).toBe(false);
    const changeEl = compiled.querySelector('.ticket-change-amount') as HTMLElement;
    expect(changeEl.textContent).toContain('30.00');

    const closeXBtn = compiled.querySelector('.btn-close-ticket') as HTMLButtonElement;
    closeXBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.ticket-dialog')).toBeFalsy();
    expect(posService.cart().length).toBe(1);

    const cancelBtn = compiled.querySelector('.btn-cancel-sale') as HTMLButtonElement;
    cancelBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(posService.cart().length).toBe(0);
  });

  it('should display sales history with period filters, product breakdown, and ticket details popup', async () => {
    const fixture = TestBed.createComponent(App);
    const posService = TestBed.inject(PosService);

    const nowIso = new Date().toISOString();
    posService.sales.set([
      {
        id: 'sale-101',
        ticket_number: 1,
        customer_id: null,
        user_id: null,
        subtotal: 8500,
        tax: 0,
        discount: 0,
        total: 8500,
        payment_method: 'cash',
        amount_received: 8500,
        change_amount: 0,
        status: 'completed',
        notes: null,
        created_at: nowIso,
        items: [
          {
            product_id: 'prod-1',
            product_name: 'Café Americano',
            quantity: 2,
            unit_price: 3500,
            subtotal: 7000,
          },
          {
            product_id: 'prod-3',
            product_name: 'Agua Natural',
            quantity: 1,
            unit_price: 1500,
            subtotal: 1500,
          },
        ],
      },
    ]);

    const compiled = fixture.nativeElement as HTMLElement;
    const historyTabBtn = Array.from(compiled.querySelectorAll('button.nav-item')).find((btn) =>
      btn.textContent?.includes('Historial de ventas'),
    ) as HTMLButtonElement;

    historyTabBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const text = compiled.textContent ?? '';
    expect(text).toContain('Hoy');
    expect(text).toContain('Ayer');
    expect(text).toContain('Última semana');
    expect(text).toContain('Último mes');
    expect(text).toContain('Últimos 3 meses');
    expect(text).toContain('Periodo que se quiera determinar');

    // Verificar desglose de productos y fila de ticket
    expect(text).toContain('Café Americano');
    expect(text).toContain('Agua Natural');

    const ticketRow = compiled.querySelector('tr.ticket-row') as HTMLElement;
    expect(ticketRow).toBeTruthy();

    ticketRow.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.ticket-dialog')).toBeTruthy();
    expect(compiled.textContent).toContain('Ticket de compra #1');
    expect(compiled.textContent).toContain('sale-101');
  });

  it('should display red "Eliminar base de datos" button in settings and open confirmation popup requiring "converse"', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const settingsBtn = compiled.querySelector(
      'button[aria-label="Configuraciones"]',
    ) as HTMLButtonElement;
    settingsBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const deleteDbBtn = compiled.querySelector('.btn-delete-db') as HTMLButtonElement;
    expect(deleteDbBtn).toBeTruthy();
    expect(deleteDbBtn.textContent).toContain('Eliminar base de datos');

    deleteDbBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const input = compiled.querySelector('#confirm-converse-input') as HTMLInputElement;
    const confirmBtn = compiled.querySelector('.btn-confirm-danger') as HTMLButtonElement;
    expect(input).toBeTruthy();
    expect(confirmBtn.disabled).toBe(true);

    input.value = 'converse';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(confirmBtn.disabled).toBe(false);
  });

  it('should convert MXN prices to integer centavos properly', () => {
    expect(mxnToCents(25.5)).toBe(2550);
    expect(mxnToCents(19.99)).toBe(1999);
    expect(mxnToCents(100)).toBe(10000);
  });
});
