import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PosService, extractErrorMessage } from '../../core/services/pos.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent {
  private readonly posService = inject(PosService);

  protected readonly showConfirmModal = signal(false);
  protected readonly confirmText = signal('');
  protected readonly deleting = signal(false);
  protected readonly feedbackMessage = signal<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  protected readonly isConfirmValid = computed(() => this.confirmText() === 'converse');

  protected openConfirmModal(): void {
    this.confirmText.set('');
    this.feedbackMessage.set(null);
    this.showConfirmModal.set(true);
  }

  protected closeConfirmModal(): void {
    if (this.deleting()) return;
    this.showConfirmModal.set(false);
    this.confirmText.set('');
  }

  protected async confirmDeleteDatabase(): Promise<void> {
    if (!this.isConfirmValid()) {
      return;
    }

    this.deleting.set(true);
    this.feedbackMessage.set(null);

    try {
      await this.posService.clearDatabase();
      this.showConfirmModal.set(false);
      this.confirmText.set('');
      this.feedbackMessage.set({
        type: 'success',
        text: 'La base de datos fue eliminada correctamente.',
      });
    } catch (err) {
      this.feedbackMessage.set({
        type: 'error',
        text: extractErrorMessage(err, 'No se pudo eliminar la base de datos.'),
      });
    } finally {
      this.deleting.set(false);
    }
  }
}
