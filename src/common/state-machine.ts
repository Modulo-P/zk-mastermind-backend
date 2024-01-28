export class Event {
  private _name: string;
  private _data: any;

  constructor(name: string) {
    this._name = name;
  }

  get name() {
    return this._name;
  }
}

export interface EventSink {
  castEvent(event: Event): void;
}

export interface StateBase {
  getName(): string;
  castEvent(event: Event): void;
}

export abstract class AutomatonBase<AI> implements EventSink {
  protected _state!: AI & StateBase;
  private _edges: Map<AI & StateBase, Map<string, AI & StateBase>> = new Map<
    AI & StateBase,
    Map<string, AI & StateBase>
  >();

  protected addEdge(
    source: AI & StateBase,
    event: Event,
    target: AI & StateBase
  ) {
    const row = this._edges.get(source);

    if (row === undefined) {
      this._edges.set(
        source,
        new Map<string, AI & StateBase>([[event.name, target]])
      );
    } else {
      row.set(event.name, target);
    }
  }

  castEvent(event: Event) {
    const edge = this._edges.get(this._state);
    if (edge === undefined) {
      throw new Error(`No edge found for state ${this._state.getName()}`);
    }
    const target = edge.get(event.name);
    if (target === undefined) {
      throw new Error(
        `No edge found for event ${
          event.name
        } in state ${this._state.getName()}`
      );
    }
    console.log(
      `Changing state from ${this._state.getName()} to ${target.getName()}`
    );
    this._state = target;
  }
}
