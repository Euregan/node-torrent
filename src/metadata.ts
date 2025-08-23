import * as bencode from "./util/bencode";
import * as crypto from "crypto";
import BitField from "./util/bitfield";
import { EventEmitter } from "events";
import * as BufferUtils from "./util/bufferutils";
import type { Info } from "./torrentdata/types";

const LOGGER = require("log4js").getLogger("metadata.js");
LOGGER.level = "debug";

const BLOCK_SIZE = 16384;

class Metadata extends EventEmitter {
  public infoHash: Buffer<ArrayBuffer>;
  public bitfield: BitField | null;
  private _encodedMetadata: Buffer<ArrayBuffer> | null;
  private _length: number;
  public _metadata: Info | undefined;

  constructor(infoHash: Buffer<ArrayBuffer>, metadata?: Info) {
    super();
    EventEmitter.call(this);

    this.infoHash = infoHash;
    this.bitfield = null;
    this._encodedMetadata = null;
    this._length = 0;
    this.setMetadata(metadata);
  }

  isComplete() {
    if (!this.bitfield || this.bitfield.length === 0) {
      return false;
    }
    return this.bitfield.cardinality() === this.bitfield.length;
  }

  hasLength() {
    return this._length > 0;
  }

  setLength(length: number) {
    this._length = length;
    if (!this._encodedMetadata || this._encodedMetadata.length !== length) {
      this.bitfield = new BitField(Math.ceil(length / BLOCK_SIZE));
      this._encodedMetadata = Buffer.alloc(length);
    }
  }

  setMetadata(_metadata: Info | undefined) {
    if (!_metadata) return;

    this._metadata = _metadata;

    if (this._metadata!.files && this._encodedMetadata) {
      LOGGER.debug(this._encodedMetadata.length);
      LOGGER.debug(_metadata.pieces?.length);
      LOGGER.debug(typeof _metadata.pieces);
      this._encodedMetadata = Buffer.alloc(
        Buffer.byteLength(bencode.encode(_metadata)),
        bencode.encode(_metadata)
      );
      LOGGER.debug(this._encodedMetadata.length);

      this.setLength(this._encodedMetadata.length);
      this.bitfield!.setAll();
    }

    if (!this.infoHash) {
      const digest = crypto
        .createHash("sha1")
        .update(bencode.encode(_metadata), "ascii")
        .digest();
      this.infoHash = Buffer.alloc(Buffer.byteLength(digest), digest, "binary");
      LOGGER.debug("Metadata complete.", this.isComplete());
      this.emit(MetadataStatus.COMPLETE);
    } else if (this.isComplete()) {
      const digest = crypto
        .createHash("sha1")
        .update(bencode.encode(_metadata), "ascii")
        .digest();
      const infoHash = Buffer.alloc(
        Buffer.byteLength(digest),
        digest,
        "binary"
      );
      if (!BufferUtils.equal(this.infoHash, infoHash)) {
        LOGGER.warn("Metadata is invalid, reseting.");
        this.bitfield!.unsetAll();
        this.emit(MetadataStatus.INVALID);
        throw "BOOM"; // TODO: why does re-encoding the metadata cos this to fail?
      } else {
        LOGGER.debug("Metadata complete.", this.isComplete());
        this.emit(MetadataStatus.COMPLETE);
      }
    }
  }

  setPiece(index: number, data: Buffer<ArrayBuffer>) {
    if (this.bitfield!.isSet(index)) {
      return;
    }

    LOGGER.debug("Setting piece at index %d with %d bytes", index, data.length);
    this.bitfield!.set(index);
    data.copy(this._encodedMetadata!, index * BLOCK_SIZE, 0, data.length);

    if (this.isComplete()) {
      this.setMetadata(
        bencode.decode<Info>(this._encodedMetadata!.toString("binary"))
      );
    }
  }
}

export enum MetadataStatus {
  COMPLETE = "metadata:complete",
  INVALID = "metadata:invalid",
}

export default Metadata;
