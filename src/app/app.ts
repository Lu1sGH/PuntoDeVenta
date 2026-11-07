import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AddProductComponent } from './features/add-product/add-product';
import { AvailableProductsComponent } from './features/available-products/available-products';
import { SettingsComponent } from './features/settings/settings';

export type NavOption = 'productos' | 'agregar' | 'venta' | 'configuraciones';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AddProductComponent, AvailableProductsComponent, SettingsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly activeOption = signal<NavOption>('productos');

  protected selectOption(option: NavOption): void {
    this.activeOption.set(option);
  }
}
