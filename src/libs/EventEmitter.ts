export class EventEmitter<T extends (...args: any[]) => void> {
  private _listeners = new Set<T>();

  public add(listener: T): void {
    this._listeners.add(listener);
  }

  public remove(listener: T): void {
    this._listeners.delete(listener);
  }

  public emit(...args: Parameters<T>): void {
    const listeners = Array.from(this._listeners);
    for (const listener of listeners) {
      listener(...args);
    }
  }

  public clear(): void {
    this._listeners.clear();
  }
}
