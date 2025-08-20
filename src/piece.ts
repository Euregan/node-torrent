import * as crypto from "crypto";
import * as ProcessUtils from "./util/processutils";
import BitField from "./util/bitfield";
import { EventEmitter } from "events";
import File, { FileMatch } from "./file";

const LOGGER = require("log4js").getLogger("piece.js");

const CHUNK_LENGTH = 16384;

class Piece extends EventEmitter {
  public files: Array<File>;
  public complete: BitField;
  public hash: string;
  public index: number;
  public length: number;
  public offset: number;
  public requested: BitField;

  public state: PieceState | null = null;

  constructor(
    index: number,
    offset: number,
    length: number,
    hash: string,
    files: Array<File>,
    callback: () => void
  ) {
    super();
    EventEmitter.call(this);

    this.complete = new BitField(Math.ceil(length / CHUNK_LENGTH));
    this.files = [];
    this.hash = hash;
    this.index = index;
    this.length = length;
    this.offset = offset;
    this.requested = new BitField(this.complete.length);
    this.setMaxListeners(this.requested.length);

    let lastMatch = FileMatch.NONE;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const match = file.contains(this.offset, this.length);
      if (
        match === FileMatch.FULL ||
        (match === FileMatch.PARTIAL && lastMatch === FileMatch.PARTIAL)
      ) {
        this.files.push(file);
      } else if (match === FileMatch.PARTIAL) {
        this.files.push(file);
      }
      lastMatch = match;
    }

    this.isValid((valid) => {
      if (valid) {
        setState(this, PieceState.COMPLETE);
      } else {
        setState(this, PieceState.INCOMPLETE);
      }
      callback();
    });
  }

  cancelRequest(begin: number) {
    const index = begin / CHUNK_LENGTH;
    this.requested.unset(index);
  }

  getData(
    begin: number,
    length: number,
    callback: (error: any | null, data?: Buffer<ArrayBuffer>) => void
  ) {
    const data = Buffer.alloc(length);
    let dataOffset = 0;
    const files = this.files.slice(0);

    const next = () => {
      if (files.length === 0 || dataOffset >= length) {
        callback(null, data);
      } else {
        const file = files.shift()!;
        file.read(
          data,
          dataOffset,
          this.offset + begin,
          length,
          (error, bytesRead) => {
            if (error) {
              callback(error);
            } else {
              dataOffset += bytesRead;
              ProcessUtils.nextTick(next);
            }
          }
        );
      }
    };

    next();
  }

  hasRequestedAllChunks() {
    return this.requested.cardinality() === this.requested.length;
  }

  isComplete() {
    return this.state === PieceState.COMPLETE;
  }

  isValid(callback: (error: any | boolean) => void) {
    const self = this;
    this.getData(0, this.length, (error, data) => {
      if (error) {
        callback(error);
      } else {
        const dataHash = crypto
          .createHash("sha1")
          .update(data!)
          .digest("binary");
        callback(self.hash === dataHash);
      }
    });
  }

  nextChunk() {
    if (this.state === PieceState.COMPLETE) {
      return null;
    }

    const indices = this.requested.or(this.complete).unsetIndices();
    if (indices.length === 0) {
      return null;
    }

    this.requested.set(indices[0]!);

    const length =
      indices[0] === this.complete.length - 1 && this.length % CHUNK_LENGTH > 0
        ? this.length % CHUNK_LENGTH
        : CHUNK_LENGTH;

    return {
      begin: indices[0]! * CHUNK_LENGTH,
      length: length,
    };
  }

  setData(
    data: Buffer<ArrayBuffer>,
    begin: number,
    callback?: (error?: any) => void
  ) {
    const index = begin / CHUNK_LENGTH;
    const self = this;

    callback = callback || function () {}; // TODO: refactor below..

    if (!this.complete.isSet(index)) {
      this.complete.set(index);

      const files = this.files.slice(0);

      const complete = (err?: any) => {
        if (err) {
          self.complete.unset(index);
          self.requested.unset(index);
          callback(err);
        } else if (self.complete.cardinality() === self.complete.length) {
          self.isValid((valid) => {
            if (valid) {
              setState(self, PieceState.COMPLETE);
            } else {
              LOGGER.debug("invalid piece, clearing.");
              self.complete = new BitField(self.complete.length);
              self.requested = new BitField(self.complete.length);
            }
            callback();
          });
        } else {
          callback();
        }
      };

      const next = () => {
        if (files.length === 0) {
          complete();
        } else {
          const file = files.shift()!;
          file.write(self.offset + begin, data, (match) => {
            if (match instanceof Error) {
              complete(match);
            } else {
              ProcessUtils.nextTick(next);
            }
          });
        }
      };
      next();
    } else {
      LOGGER.warn("Attempt to overwrite data at " + self.offset + ".");
      callback();
    }
  }
}

const setState = (piece: Piece, state: PieceState) => {
  piece.state = state;
  piece.emit(state, piece);
};

export enum PieceState {
  COMPLETE = "complete",
  INCOMPLETE = "incomplete",
}

export default Piece;
