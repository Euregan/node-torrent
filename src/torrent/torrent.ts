import BitField from "../util/bitfield";
import DHT from "../dht";
import RequestManager from "./requestmanager";
import { EventEmitter } from "events";
import Message, { MESSAGE_EXTENDED_HANDSHAKE, MessageCode } from "../message";
import Peer, { PeerEvent } from "../peer";
import Piece, { PieceState } from "../piece";
import * as ProcessUtils from "../util/processutils";
import TorrentData from "../torrentdata/torrentdata";
import createFiles from "./createfiles";
import createPieces from "./createpieces";
import type Tracker from "../tracker/tracker";
import type File from "../file";
import * as BufferUtils from "../util/bufferutils";
import type Metadata from "../metadata";
import type MetadataExtension from "../extension/metadata";
import type { Info } from "../torrentdata/Metadata";

const LOGGER = require("log4js").getLogger("torrent.js");

type TorrentStats = {
  downloaded: number;
  downloadRate: number;
  uploaded: number;
  uploadRate: number;
};

class Torrent extends EventEmitter {
  public clientId: Buffer<ArrayBuffer>;
  public clientPort: number;
  public infoHash: Buffer<ArrayBuffer> | null;
  private stats: TorrentStats;

  public peers: Record<string, Peer>;
  public trackers: Array<Tracker>;
  public bitfield: BitField | null;
  public status: TorrentStatus;

  private _metadata: Metadata | null;
  private _requestManager;
  private _files: Array<File>;
  private _size?: number;
  public _pieces: Array<Piece> | undefined;
  private _downloadPath;
  private _extensions: Array<typeof MetadataExtension>;
  private _extensionMap: Record<string, number> | null;

  constructor(
    clientId: Buffer<ArrayBuffer>,
    clientPort: number,
    downloadPath: string,
    dataUrl: string,
    extensions: Array<typeof MetadataExtension>
  ) {
    super();
    EventEmitter.call(this);

    this.clientId = clientId;
    this.clientPort = clientPort;

    this.infoHash = null;

    this.stats = {
      downloaded: 0,
      downloadRate: 0,
      uploaded: 0,
      uploadRate: 0,
    };

    this.peers = {};
    this.trackers = [];
    this.bitfield = null;
    this.status = TorrentStatus.LOADING;

    this._metadata = null;
    this._requestManager = new RequestManager(this);
    this._files = [];
    this._pieces = [];
    this._downloadPath = downloadPath;
    this._extensions = extensions;
    this._extensionMap = null;

    const torrent = this;
    // load torrent data
    TorrentData.load(dataUrl, (error, metadata, trackers) => {
      if (error) {
        LOGGER.warn("Error loading torrent data. error = %j", error);
        torrent.setStatus(TorrentStatus.ERROR, error);
      } else {
        LOGGER.debug("Torrent data loaded.");
        torrent._metadata = metadata!;
        trackers!.forEach((tracker) => {
          torrent.addTracker(tracker);
        });
        torrent.initialise();
      }
    });
  }

  start() {
    LOGGER.debug("Starting torrent.");
    const callback = this.addPeer.bind(this);
    // TODO: treat as tracker
    DHT.advertise(this.infoHash!, callback);

    this.trackers.forEach((tracker) => {
      tracker.start(callback);
    });
  }

  stop() {
    if (this.status === TorrentStatus.READY) {
      for (let i = 0; i < this.trackers.length; i++) {
        this.trackers[i]!.stop();
      }
      for (const id in this.peers) {
        const peer = this.peers[id]!;
        peer.disconnect("Torrent stopped.");
      }
    }
  }

  addPeer(peer: Peer): void;
  addPeer(id: string, address: string, port: number): void;
  addPeer(peerOrId: Peer | string, address?: string, port?: number): void {
    const peer =
      typeof peerOrId === "string"
        ? new Peer(peerOrId, address!, port!, this)
        : peerOrId;

    LOGGER.debug("Adding peer, id = " + peer.getIdentifier());

    if (!(peer.getIdentifier() in this.peers)) {
      this.peers[peer.getIdentifier()] = peer;

      const onConnect = () => {
        LOGGER.debug("CONNECT from %s", peer.getIdentifier());
        if (peer.supportsExtension()) {
          LOGGER.debug(
            "Sending extended handshake.  extension map = %j",
            this._extensionMap
          );
          peer.sendExtendedMessage(MESSAGE_EXTENDED_HANDSHAKE, {
            m: this._extensionMap,
            port: this.clientPort,
          });
        }
        if (this.bitfield) {
          peer.sendMessage(
            new Message(MessageCode.BITFIELD, this.bitfield.toBuffer())
          );
        }
      };

      peer.on(PeerEvent.RATE_UPDATE, (rate) => {
        if (rate.type === "upload") {
          this.stats.uploadRate -= rate.previous;
          this.stats.uploadRate += rate.current;
        } else {
          this.stats.downloadRate -= rate.previous;
          this.stats.downloadRate += rate.current;
        }
      });

      peer.once(PeerEvent.DISCONNECT, () => {
        LOGGER.debug("DISCONNECT from %s", peer.getIdentifier());
        peer.removeAllListeners(PeerEvent.CONNECT);
        peer.removeAllListeners(PeerEvent.DISCONNECT);
        peer.removeAllListeners(PeerEvent.EXTENDED);
        peer.removeAllListeners(PeerEvent.UPDATED);
        delete this.peers[peer.getIdentifier()];
      });

      peer.on(PeerEvent.EXTENDED, (peer, code, message) => {
        LOGGER.debug("EXTENDED from %s, code = %d", peer.getIdentifier(), code);
        let extensionKey;
        Object.keys(this._extensionMap!).some((key) => {
          if (this._extensionMap![key] === code) {
            extensionKey = key;
            return true;
          }
        });

        if (extensionKey && this._extensionMap![extensionKey]) {
          (
            this._extensions[
              this._extensionMap![extensionKey]! - 1
            ] as unknown as MetadataExtension
          ).handleMessage(peer, message);
        }
      });

      peer.on(PeerEvent.UPDATED, () => {
        const interested =
          !this.bitfield ||
          peer.bitfield!.xor(peer.bitfield!.and(this.bitfield)).setIndices()
            .length > 0;
        LOGGER.debug(
          "UPDATED: " +
            (interested ? "interested" : "not interested") +
            " in " +
            peer.getIdentifier()
        );
        peer.setAmInterested(interested);
      });

      this.emit(TorrentStatus.PEER, peer);

      if (peer.connected) {
        onConnect();
      } else {
        peer.once(PeerEvent.CONNECT, onConnect);
      }
    }
  }

  addTracker(tracker: Tracker) {
    this.trackers.push(tracker);
    tracker.setTorrent(this);
    // tracker.on(Tracker.PEER, this.addPeer.bind(this));
  }

  hasMetadata() {
    return this._metadata!.isComplete();
  }

  isComplete() {
    return this.bitfield!.cardinality() === this.bitfield!.length;
  }

  setMetadata(metadata: Metadata) {
    this._metadata = metadata;
    this.initialise();
  }

  private initialise() {
    LOGGER.debug("Initialising torrent.");
    if (this.status === TorrentStatus.READY) {
      LOGGER.debug("Already initialised, skipping.");
      return;
    }

    if (!this._extensionMap) {
      this._extensionMap = {};
      for (let i = 0; i < this._extensions.length; i++) {
        const ExtensionClass = this._extensions[i]!;
        const extension = new ExtensionClass(this);
        const extensionCode = i + 1;

        // @ts-expect-error
        this._extensions[i] = extension;
        this._extensionMap[ExtensionClass.EXTENSION_KEY] = extensionCode;
      }
    }

    if (!this.infoHash) {
      this.infoHash = this._metadata!.infoHash;
      ProcessUtils.nextTick(() => {
        this.emit(TorrentStatus.INFO_HASH, this.infoHash);
      });
    }

    if (this.hasMetadata()) {
      LOGGER.debug("Metadata is complete, initialising files and pieces.");

      createFiles(
        this._downloadPath,
        // @ts-expect-error
        this._metadata,
        (error, _files, _size) => {
          if (error) {
            this.setStatus(TorrentStatus.ERROR, error);
          } else {
            this._files = _files!;
            this._size = _size!;

            createPieces(
              // @ts-expect-error
              this._metadata.pieces,
              _files!,
              // @ts-expect-error
              this._metadata["piece length"],
              _size!,
              (error, _pieces) => {
                if (error) {
                  this.setStatus(TorrentStatus.ERROR, error);
                } else {
                  this._pieces = _pieces!;
                  this.bitfield = new BitField(_pieces!.length);
                  const completeHandler = this.pieceComplete.bind(this);

                  _pieces!.forEach((piece) => {
                    if (piece.isComplete()) {
                      this.bitfield!.set(piece.index);
                    } else {
                      piece.once(PieceState.COMPLETE, completeHandler);
                    }
                  });
                  ProcessUtils.nextTick(() => {
                    this.setStatus(TorrentStatus.READY);
                  });
                }
              }
            );
          }
        }
      );
    }
  }

  private pieceComplete(piece: Piece) {
    LOGGER.debug("Piece complete, piece index = " + piece.index);
    this.stats.downloaded += piece.length;

    this.emit(TorrentStatus.PROGRESS, this.stats.downloaded / this._size!);

    if (this.isComplete()) {
      LOGGER.info("torrent download complete");
      this.setStatus(TorrentStatus.COMPLETE);
    }

    const have = new Message(
      MessageCode.HAVE,
      BufferUtils.fromInt(piece.index)
    );
    for (const i in this.peers) {
      const peer = this.peers[i]!;
      if (peer.initialised) {
        peer.sendMessage(have);
      }
    }
  }

  private setStatus(status: TorrentStatus, data?: unknown) {
    LOGGER.debug("Status updated to %s", status);
    this.emit(status, data);
    this.status = status;
    if (status === TorrentStatus.ERROR) {
      this.stop();
    }
  }

  requestChunk(
    index: number,
    begin: number,
    length: number,
    callback: (error: any | null, data?: Buffer<ArrayBuffer>) => void
  ) {
    var piece = this._pieces![index];
    if (piece) {
      piece.getData(begin, length, (err, data) => {
        if (err) {
          callback(err);
        } else {
          callback(null, data);
        }
      });
    } else {
      callback(null);
    }
  }
}

export enum TorrentStatus {
  COMPLETE = "torrent:complete",
  ERROR = "torrent:error",
  INFO_HASH = "torrent:info_hash",
  LOADING = "torrent:loading",
  PEER = "torrent:peer",
  PROGRESS = "torrent:progress",
  READY = "torrent:ready",
}

export default Torrent;
