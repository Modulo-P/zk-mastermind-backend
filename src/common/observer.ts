export abstract class Publisher<D> {
  protected _observers: Observer<D>[] = [];

  public subscribe(observer: Observer<D>) {
    this._observers.push(observer);
  }

  unsubcribe(observer: Observer<D>) {
    this._observers.slice(this._observers.indexOf(observer), 1);
  }

  async notify(data: D) {
    this._observers.forEach((observer) => {
      observer.update(data);
    });
  }
}

export abstract class Observer<D, T = Publisher<D>> {
  protected _publisher: T;

  constructor(publisher: T) {
    this._publisher = publisher;
  }

  abstract update(data: D): Promise<void>;
}
