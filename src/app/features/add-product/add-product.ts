import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PosService, extractErrorMessage } from '../../core/services/pos.service';

@Component({
  selector: 'app-add-product',
  imports: [FormsModule],
  templateUrl: './add-product.html',
  styleUrl: './add-product.css',
})
export class AddProductComponent {
  private readonly posService = inject(PosService);

  @ViewChild('photoInput') private photoInputRef?: ElementRef<HTMLInputElement>;

  protected readonly name = signal('');
  protected readonly quantity = signal<number | null>(null);
  protected readonly priceMxn = signal<number | null>(null);
  protected readonly description = signal('');
  protected readonly photoFile = signal<File | null>(null);
  protected readonly photoPreview = signal<string | null>(null);

  protected readonly saving = signal(false);
  protected readonly statusMessage = signal<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoFile.set(file);

    if (!file) {
      this.photoPreview.set(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview.set(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  protected clearForm(): void {
    this.name.set('');
    this.quantity.set(null);
    this.priceMxn.set(null);
    this.description.set('');
    this.photoFile.set(null);
    this.photoPreview.set(null);
    this.statusMessage.set(null);

    if (this.photoInputRef?.nativeElement) {
      this.photoInputRef.nativeElement.value = '';
    }
  }

  protected async onSubmit(): Promise<void> {
    this.statusMessage.set(null);

    const trimmedName = this.name().trim();
    const qty = this.quantity();
    const price = this.priceMxn();

    if (!trimmedName) {
      this.statusMessage.set({
        type: 'error',
        text: 'El nombre del producto es obligatorio.',
      });
      return;
    }

    if (qty === null || qty < 0 || !Number.isInteger(Number(qty))) {
      this.statusMessage.set({
        type: 'error',
        text: 'Ingresa una cantidad válida (número entero mayor o igual a 0).',
      });
      return;
    }

    if (price === null || price < 0 || Number.isNaN(Number(price))) {
      this.statusMessage.set({
        type: 'error',
        text: 'Ingresa un precio válido en MXN.',
      });
      return;
    }

    this.saving.set(true);

    try {
      const saved = await this.posService.createProductFromForm({
        name: trimmedName,
        quantity: Number(qty),
        priceMxn: Number(price),
        description: this.description(),
        photoFile: this.photoFile(),
      });

      this.clearForm();
      this.statusMessage.set({
        type: 'success',
        text: `Producto "${saved.name}" guardado correctamente.`,
      });
    } catch (err) {
      this.statusMessage.set({
        type: 'error',
        text: extractErrorMessage(err, 'No se pudo guardar el producto.'),
      });
    } finally {
      this.saving.set(false);
    }
  }
}
