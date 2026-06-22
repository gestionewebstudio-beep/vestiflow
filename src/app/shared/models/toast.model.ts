export type ToastTone = 'error' | 'info';

export interface ToastMessage {
  readonly id: string;
  readonly message: string;
  readonly tone: ToastTone;
  readonly durationMs: number;
}
