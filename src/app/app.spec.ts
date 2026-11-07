import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { mxnToCents } from './core/models/pos.models';
import { PosService } from './core/services/pos.service';

describe('App', () => {
  beforeEach(async () => {
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

    expect(text).toContain('Productos disponibles');
    expect(text).toContain('Agregar productos');
    expect(text).toContain('Realizar venta');
    expect(compiled.querySelector('button[aria-label="Configuraciones"]')).toBeTruthy();
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
