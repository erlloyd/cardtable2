export interface Game {
  id: string;
  name: string;
  description: string;
  version: string;
  manifestUrl: string;
  boxArt?: string;
}

export interface GamesIndex {
  games: Game[];
}
