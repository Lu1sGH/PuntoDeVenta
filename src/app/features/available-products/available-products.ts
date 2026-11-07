import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product, centsToMxn } from '../../core/models/pos.models';
import { PosService, extractErrorMessage } from '../../core/services/pos.service';

@Component({
  selector: 'app-available-products',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './available-products.html',
  styleUrl: './available-products.css',
})
export class AvailableProductsComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly posService = inject(PosService);

  protected readonly selectedProduct = signal<Product | null>(null);
  protected readonly isEditing = signal(false);
  protected readonly actionBusy = signal(false);
  protected readonly modalMessage = signal<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Campos de edición dentro del pop up
  protected readonly editName = signal('');
  protected readonly editQuantity = signal<number>(0);
  protected readonly editPriceMxn = signal<number>(0);
  protected readonly editDescription = signal('');
  protected readonly editPhotoFile = signal<File | null>(null);
  protected readonly editPhotoPreview = signal<string | null>(null);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      void this.posService.loadProducts().catch(() => {
        // El error ya queda registrado en posService.error
      });
    }
  }

  protected formatPriceMxn(priceCents: number): number {
    return centsToMxn(priceCents);
  }

  protected openProductModal(product: Product): void {
    this.selectedProduct.set(product);
    this.isEditing.set(false);
    this.modalMessage.set(null);
    this.populateEditFields(product);
  }

  protected closeModal(): void {
    this.selectedProduct.set(null);
    this.isEditing.set(false);
    this.modalMessage.set(null);
    this.editPhotoFile.set(null);
  }

  protected toggleEditMode(): void {
    const product = this.selectedProduct();
    if (!product) return;

    this.modalMessage.set(null);
    if (!this.isEditing()) {
      this.populateEditFields(product);
      this.isEditing.set(true);
    } else {
      this.isEditing.set(false);
    }
  }

  private populateEditFields(product: Product): void {
    this.editName.set(product.name);
    this.editQuantity.set(product.stock);
    this.editPriceMxn.set(centsToMxn(product.price));
    this.editDescription.set(product.description ?? '');
    this.editPhotoFile.set(null);
    this.editPhotoPreview.set(product.image_url);
  }

  protected onEditPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.editPhotoFile.set(file);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.editPhotoPreview.set(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  protected async saveProductChanges(): Promise<void> {
    const current = this.selectedProduct();
    if (!current) return;

    const trimmedName = this.editName().trim();
    const qty = Number(this.editQuantity());
    const price = Number(this.editPriceMxn());

    if (!trimmedName) {
      this.modalMessage.set({
        type: 'error',
        text: 'El nombre del producto no puede estar vacío.',
      });
      return;
    }

    if (Number.isNaN(qty) || qty < 0 || !Number.isInteger(qty)) {
      this.modalMessage.set({
        type: 'error',
        text: 'La cantidad debe ser un número entero mayor o igual a 0.',
      });
      return;
    }

    if (Number.isNaN(price) || price < 0) {
      this.modalMessage.set({
        type: 'error',
        text: 'Ingresa un precio válido en MXN.',
      });
      return;
    }

    this.actionBusy.set(true);
    this.modalMessage.set(null);

    try {
      const updated = await this.posService.updateProductFromForm(
        current.id,
        {
          name: trimmedName,
          quantity: qty,
          priceMxn: price,
          description: this.editDescription(),
          photoFile: this.editPhotoFile(),
        },
        current.image_url,
      );

      this.selectedProduct.set(updated);
      this.isEditing.set(false);
      this.modalMessage.set({
        type: 'success',
        text: 'Producto actualizado correctamente.',
      });
    } catch (err) {
      this.modalMessage.set({
        type: 'error',
        text: extractErrorMessage(err, 'No se pudo actualizar el producto.'),
      });
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected async deleteSelectedProduct(): Promise<void> {
    const current = this.selectedProduct();
    if (!current) return;

    this.actionBusy.set(true);
    this.modalMessage.set(null);

    try {
      await this.posService.deleteProduct(current.id);
      this.closeModal();
    } catch (err) {
      this.modalMessage.set({
        type: 'error',
        text: extractErrorMessage(err, 'No se pudo eliminar el producto.'),
      });
    } finally {
      this.actionBusy.set(false);
    }
  }
}
