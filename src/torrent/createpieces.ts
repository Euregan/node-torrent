import type File from "../file";
import Piece from "../piece";

function createPieces(
  hashes: string,
  files: Array<File>,
  pieceLength: number,
  sizeOfDownload: number,
  callback: (error: any | null, pieces?: Array<Piece>) => void
) {
  const pieces: Array<Piece> = [];
  const numberOfPieces = hashes.length / 20;
  const currentIndex = 0;

  createPiece(
    pieces,
    hashes,
    files,
    currentIndex,
    numberOfPieces,
    pieceLength,
    sizeOfDownload,
    callback
  );
}

function createPiece(
  pieces: Array<Piece>,
  hashes: string,
  files: Array<File>,
  currentIndex: number,
  numberOfPieces: number,
  pieceLength: number,
  sizeOfDownload: number,
  callback: (error: any | null, pieces?: Array<Piece>) => void
) {
  if (currentIndex === numberOfPieces) {
    callback(null, pieces);
  } else {
    const hash = hashes.substr(currentIndex * 20, 20);
    let lengthOfNextPiece = pieceLength;

    if (currentIndex === numberOfPieces - 1) {
      lengthOfNextPiece = sizeOfDownload % pieceLength;
    }

    const piece = new Piece(
      currentIndex,
      currentIndex * pieceLength,
      lengthOfNextPiece,
      hash,
      files,
      () => {
        createPiece(
          pieces,
          hashes,
          files,
          currentIndex + 1,
          numberOfPieces,
          pieceLength,
          sizeOfDownload,
          callback
        );
      }
    );
    pieces.push(piece);
  }
}

export default createPieces;
