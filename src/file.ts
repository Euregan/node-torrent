import * as fs from "fs";

class File {
  path: string;
  length: number;
  offset: number;
  fd: null | number = null;
  busy: boolean = false;

  constructor(
    filePath: string,
    length: number,
    offset: number | null,
    callback: (error: any) => void
  ) {
    this.path = filePath;
    this.length = length;
    this.offset = offset || 0;

    fs.exists(filePath, (exists) => {
      const flag = exists ? "r+" : "w+";
      fs.open(filePath, flag, 0o666, (err, fd) => {
        this.fd = fd;
        callback(err);
      });
    });
  }

  contains(pieceOffset: number, length: number) {
    const fileEnd = this.offset + this.length;
    const pieceEnd = pieceOffset + length;

    if (pieceOffset >= this.offset && pieceEnd <= fileEnd) {
      return FileMatch.FULL;
    }
    if (
      (this.offset >= pieceOffset && this.offset <= pieceEnd) ||
      (fileEnd >= pieceOffset && fileEnd <= pieceEnd)
    ) {
      return FileMatch.PARTIAL;
    }
    return FileMatch.NONE;
  }

  read(
    buffer: Buffer<ArrayBuffer>,
    bufferOffset: number,
    pieceOffset: number,
    length: number,
    callback: (error: any | null, bytesWritten: number) => void
  ) {
    const match = this.contains(pieceOffset, length);
    if (match === FileMatch.PARTIAL || match === FileMatch.FULL) {
      const bounds = calculateBounds(this, pieceOffset, length);
      this.busy = true;
      fs.read(
        this.fd!,
        buffer,
        bufferOffset,
        bounds.dataLength,
        bounds.offset,
        (err, bytesRead) => {
          this.busy = false;
          callback(err, bytesRead);
        }
      );
    } else {
      callback(null, 0);
    }
  }

  write(
    pieceOffset: number,
    data: Buffer<ArrayBuffer>,
    callback: (error: any | null, bytesWritten: number) => void
  ) {
    const match = this.contains(pieceOffset, data.length); // TODO: undefined
    if (match === FileMatch.PARTIAL || match === FileMatch.FULL) {
      const bounds = calculateBounds(this, pieceOffset, data.length);
      this.busy = true;
      fs.write(
        this.fd!,
        data,
        bounds.dataOffset,
        bounds.dataLength,
        bounds.offset,
        (err, bytesWritten) => {
          this.busy = false;
          callback(err, bytesWritten);
        }
      );
    } else {
      callback(null, 0);
    }
  }
}

const calculateBounds = (file: File, offset: number, length: number) => {
  const dataStart = Math.max(file.offset, offset);
  const dataEnd = Math.min(file.offset + file.length, offset + length);

  return {
    dataOffset: dataStart - offset,
    dataLength: dataEnd - dataStart,
    offset: Math.max(offset - file.offset, 0),
  };
};

export enum FileMatch {
  PARTIAL = "partial",
  FULL = "full",
  NONE = "none",
}

export default File;
