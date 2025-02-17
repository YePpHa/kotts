export interface IStreamingMedia {
  readonly duration: number;

  next(type: string, data: Uint8Array): Promise<void>;
  end(): void;
}