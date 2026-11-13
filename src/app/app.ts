import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AddProductComponent } from './features/add-product/add-product';
import { AvailableProductsComponent } from './features/available-products/available-products';
import { MakeSaleComponent } from './features/make-sale/make-sale';
import { SalesHistoryComponent } from './features/sales-history/sales-history';
import { SettingsComponent } from './features/settings/settings';

export type NavOption =
  | 'productos'
  | 'agregar'
  | 'venta'
  | 'historial'
  | 'configuraciones';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    AddProductComponent,
    AvailableProductsComponent,
    MakeSaleComponent,
    SalesHistoryComponent,
    SettingsComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly activeOption = signal<NavOption>('productos');
  protected readonly mobileMenuOpen = signal<boolean>(false);

  protected selectOption(option: NavOption): void {
    this.activeOption.set(option);
    this.mobileMenuOpen.set(false);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }
}
