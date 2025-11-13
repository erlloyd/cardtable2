interface BoardProps {
  tableId: string;
}

function Board({ tableId }: BoardProps) {
  return (
    <div className="board" data-testid="board">
      <p>Board loaded for table: {tableId}</p>
      <p>
        This is a placeholder for the PixiJS board that will be implemented in
        M2.
      </p>
    </div>
  );
}

export default Board;
