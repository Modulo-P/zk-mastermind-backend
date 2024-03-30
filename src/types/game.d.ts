export interface Game {
  id: string;
  codeMaster: User;
  codeBreaker: User;
  solutionHash: string;
  adaAmount: string;
  txHash: string;
  outputIndex: number;
  currentTurn: number;
  currentDatum: string;
  state: "CREATED" | "STARTED" | "FINISHED";
  turns: Array<Turn>;
  expirationTime: string;
}

export type Turn = {
  id: string;
  gameId: number;
  turnNumber: number;
  player: "CODEBREAKER" | "CODEMASTER";
  guessSequence: Array<number | null>;
  blackPegs: number;
  whitePegs: number;
  datum: string;
  txHash: string;
  outputIndex: number;
  expirationTime: string;
};

export type RowState = {
  colorSequence: Array<number | null>;
  selectedArray: Array<boolean>;
  blocked: boolean;
  selected: boolean;
  blackPegs: number;
  whitePegs: number;
  datum: string;
};
