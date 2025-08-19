import type Torrent from "./torrent/torrent";
import net, { Socket } from "net";
import * as bencode from "./util/bencode";
import * as ProcessUtils from "./util/processutils";
import BitField from "./util/bitfield";
import * as BufferUtils from "./util/bufferutils";
import { EventEmitter } from "events";
import Message, { MESSAGE_EXTENDED_HANDSHAKE, MessageCode } from "./message";
import Piece, { PieceState } from "./piece";

const protocolHeaderStr =
  "\x13BitTorrent protocol\x00\x00\x00\x00\x00\x10\x00\x00";

const BITTORRENT_HEADER = Buffer.alloc(
  Buffer.byteLength(protocolHeaderStr),
  protocolHeaderStr,
  "binary"
);
const KEEPALIVE_PERIOD = 120000;
const MAX_REQUESTS = 10;

const LOGGER = require("log4js").getLogger("peer.js");

class Peer extends EventEmitter {
  public choked;
  public data;
  public drained;
  public initialised;
  public interested;
  public amInterested: boolean = false;
  public messages: Array<Message>;
  public toSend: Array<Message>;
  public pieces: Record<number, Piece>;
  public numRequests;
  public requests: Record<number, Record<number, Date>>;
  public requestsCount: Record<number, number>;
  public stream;
  public handshake;
  public downloaded;
  public uploaded;
  public downloadedHistory: Array<{ ts: number; value: number }>;
  public downloadRates: Array<{ ts: number; value: number }>;
  public currentDownloadRate;
  public uploadedHistory: Array<{ ts: number; value: number }>;
  public uploadRates: Array<{ ts: number; value: number }>;
  public currentUploadRate;
  public running;
  public processing;
  public debugStatus;
  public address;
  public port;
  public peerId;
  public sending: boolean = false;
  public _extensionData?: { m: Record<string, number>; metadata_size: number };
  public _supportsExtension: boolean = false;

  public disconnected: boolean = true;
  public connected: boolean = false;

  public bitfield: BitField | null = null;

  public keepAliveId?: NodeJS.Timeout;

  public torrent: Torrent | null = null;

  constructor(stream: Socket);
  constructor(peerId: string, address: string, port: number, torrent: Torrent);
  constructor(
    streamOrPeerId: Socket | string,
    address?: string,
    port?: number,
    torrent?: Torrent
  ) {
    super();

    EventEmitter.call(this);

    this.choked = true;
    this.data = Buffer.alloc(0);
    this.drained = true;
    this.initialised = false;
    this.interested = false;
    this.messages = [];
    this.toSend = [];
    this.pieces = {};
    this.numRequests = 0;
    this.requests = {};
    this.requestsCount = {};
    this.stream = null;
    this.handshake = false;

    this.downloaded = 0;
    this.uploaded = 0;
    this.downloadedHistory = [];
    this.downloadRates = [];
    this.currentDownloadRate = 0;
    this.uploadedHistory = [];
    this.uploadRates = [];
    this.currentUploadRate = 0;

    this.running = false;
    this.processing = false;

    this.debugStatus = "";

    if (typeof streamOrPeerId === "object") {
      this.debugStatus += "incoming:";
      this.stream = streamOrPeerId;
      this.address = this.stream.remoteAddress;
      this.port = this.stream.remotePort;
    } else {
      this.debugStatus += "outgoing:";
      this.peerId = streamOrPeerId;
      this.address = address;
      this.port = port;
      this.setTorrent(torrent!);
    }

    this.connect();

    setTimeout(() => {
      forceUpdateRates(this);
    }, 1000);
  }

  connect() {
    if (this.stream === null) {
      LOGGER.debug(
        "Connecting to peer at " + this.address + " on " + this.port
      );
      this.stream = net.createConnection(this.port!, this.address);
      this.stream.on("connect", () => {
        onConnect(this);
      });
    }

    this.stream.on("data", (data: Buffer<ArrayBuffer>) => {
      onData(this, data);
    });
    this.stream.on("drain", () => {
      onDrain(this);
    });
    this.stream.on("end", () => {
      onEnd(this);
    });
    this.stream.on("error", (error) => {
      onError(this, error);
    });
  }

  disconnect(message: string, reconnectTimeout?: number) {
    LOGGER.debug(
      "Peer.disconnect [" + this.getIdentifier() + "] message =",
      message
    );
    this.disconnected = true;
    this.connected = false;
    if (this.stream) {
      this.stream.removeAllListeners();
      this.stream = null;
    }
    if (this.keepAliveId) {
      clearInterval(this.keepAliveId);
      delete this.keepAliveId;
    }
    for (const index in this.pieces) {
      const piece = this.pieces[index];
      const requests = this.requests[index];
      if (requests) {
        for (const reqIndex in requests) {
          piece!.cancelRequest(requests[reqIndex]!.getTime());
        }
      }
    }
    this.requests = {};
    this.requestsCount = {};

    this.messages = [];
    this.toSend = [];

    this.emit(PeerEvent.DISCONNECT, this);

    if (reconnectTimeout) {
      setTimeout(() => {
        this.connect();
      }, reconnectTimeout);
    }
  }

  getIdentifier() {
    return Peer.getIdentifier(this);
  }

  static getIdentifier(peer: Peer) {
    return peer.address + ":" + peer.port;
  }

  requestPiece(piece: Piece) {
    if (piece && !piece.isComplete()) {
      if (!this.pieces[piece.index]) {
        this.pieces[piece.index] = piece;
        this.requests[piece.index] = {};

        piece.once(PieceState.COMPLETE, () => {
          delete this.pieces[piece.index];
        });
      }

      let nextChunk;
      while (
        this.numRequests < MAX_REQUESTS &&
        (nextChunk = piece.nextChunk())
      ) {
        this.requests[piece.index]![nextChunk.begin] = new Date();
        const msgBuffer = Buffer.alloc(12);
        msgBuffer.writeInt32BE(piece.index, 0);
        msgBuffer.writeInt32BE(nextChunk.begin, 4);
        msgBuffer.writeInt32BE(nextChunk.length, 8);
        const message = new Message(MessageCode.REQUEST, msgBuffer);
        this.sendMessage(message);
        this.requestsCount[piece.index] =
          (this.requestsCount[piece.index] || 0) + 1;
        this.numRequests++;
      }
    }

    if (this.isReady()) {
      ProcessUtils.nextTick(() => {
        this.emit(PeerEvent.READY, this);
      });
    }
  }

  sendMessage(message: Message) {
    this.messages.push(message);
    if (!this.running) {
      this.running = true;
      ProcessUtils.nextTick(() => {
        nextMessage(this);
      });
    }
  }

  sendExtendedMessage(type: string, data: any) {
    LOGGER.debug(
      "Peer [%s] sending extended message of type %j",
      this.getIdentifier(),
      type
    );

    const code =
      MESSAGE_EXTENDED_HANDSHAKE === type
        ? 0
        : this._extensionData && this._extensionData.m[type];

    if (code !== undefined) {
      const codeAsBuffer = Buffer.alloc(1);
      codeAsBuffer[0] = code;

      LOGGER.debug(
        "Peer [%s] extended request code = %j",
        this.getIdentifier(),
        codeAsBuffer[0]
      );

      const payload = Buffer.alloc(
        Buffer.byteLength(bencode.encode(data)),
        bencode.encode(data)
      );

      const message = new Message(
        MessageCode.EXTENDED,
        BufferUtils.concat(codeAsBuffer, payload)
      );

      this.sendMessage(message);
    } else {
      throw new Error("Peer doesn't support extended request of type " + type);
    }
  }

  setAmInterested(interested: boolean) {
    if (interested && !this.amInterested) {
      this.sendMessage(new Message(MessageCode.INTERESTED));
      LOGGER.debug("Sent INTERESTED to " + this.getIdentifier());
      this.amInterested = true;
      if (this.isReady()) {
        this.emit(PeerEvent.READY, this);
      }
    } else if (!interested && this.amInterested) {
      this.sendMessage(new Message(MessageCode.UNINTERESTED));
      LOGGER.debug("Sent UNINTERESTED to " + this.getIdentifier());
      this.amInterested = false;
    }
  }

  setTorrent(torrent: Torrent) {
    this.torrent = torrent;
    this.bitfield = new BitField(
      torrent.bitfield ? torrent.bitfield.length : 0
    );
    if (this.stream) {
      if (this.initialised) {
        throw "Already initialised";
      }
      doHandshake(this);
      this.initialised = true;
    }
    this.torrent.addPeer(this);
  }

  isReady() {
    return this.amInterested && !this.choked && this.numRequests < MAX_REQUESTS;
  }

  supportsExtension(key?: string) {
    if (key) {
      return this._extensionData && this._extensionData.m[key];
    }
    return this._supportsExtension;
  }
}

function forceUpdateRates(peer: Peer) {
  updateRates(peer, "down");
  updateRates(peer, "up");

  if (!peer.disconnected) {
    setTimeout(function () {
      forceUpdateRates(peer);
    }, 1000);
  }
}

function doHandshake(peer: Peer) {
  peer.debugStatus += "handshake:";
  const stream = peer.stream!;
  stream.write(BITTORRENT_HEADER);
  stream.write(peer.torrent!.infoHash!);
  stream.write(peer.torrent!.clientId);
  peer.handshake = true;
  LOGGER.debug("Sent HANDSHAKE to " + peer.getIdentifier());
}

function handleHandshake(peer: Peer) {
  const data = peer.data;
  if (data.length < 68) {
    // Not enough data.
    return;
  }

  if (!BufferUtils.equal(BITTORRENT_HEADER.slice(0, 20), data.slice(0, 20))) {
    peer.disconnect("Invalid handshake. data = " + data.toString("binary"));
  } else {
    peer.debugStatus += "incoming_handshake:";

    const infoHash = data.slice(28, 48);
    peer.peerId = data.toString("binary", 48, 68);
    LOGGER.debug("Received HANDSHAKE from " + peer.getIdentifier());

    peer.data = BufferUtils.slice(data, 68);

    peer._supportsExtension = (data[25]! & 0x10) > 0;

    peer.connected = true;
    if (peer.torrent) {
      peer.initialised = true;
      peer.running = true;
      nextMessage(peer);
      processData(peer);
      peer.emit(PeerEvent.CONNECT);
    } else {
      peer.emit(PeerEvent.CONNECT, infoHash);
    }
  }
}

function nextMessage(peer: Peer) {
  if (!peer.disconnected && peer.initialised) {
    (function next() {
      if (peer.messages.length === 0) {
        peer.running = false;
        setKeepAlive(peer);
      } else {
        if (!peer.stream) {
          peer.connect();
        } else {
          if (peer.keepAliveId) {
            clearInterval(peer.keepAliveId);
            delete peer.keepAliveId;
          }
          while (peer.messages.length > 0) {
            const message = peer.messages.shift()!;
            message.writeTo(peer.stream);
          }
          next();
        }
      }
    })();
  }
}

function onConnect(peer: Peer) {
  peer.debugStatus += "onConnect:";
  peer.disconnected = false;
  if (peer.torrent) {
    if (!peer.handshake) {
      doHandshake(peer);
    } else {
      peer.running = true;
      nextMessage(peer);
    }
  }
}

function onData(peer: Peer, data: Buffer<ArrayBuffer>) {
  peer.data = BufferUtils.concat(peer.data, data);
  if (!peer.initialised) {
    handleHandshake(peer);
  } else {
    if (!peer.processing) {
      processData(peer);
    }
  }
}

function onDrain(peer: Peer) {
  peer.drained = true;
}

function onEnd(peer: Peer) {
  LOGGER.debug("Peer [" + peer.getIdentifier() + "] received end");
  peer.stream = null;
  if (peer.amInterested) {
    peer.disconnect("after end, reconnect", 5000);
  } else {
    peer.disconnect("stream ended and no interest");
  }
}

function onError(peer: Peer, error: Error) {
  peer.disconnect(error.message);
}

function sendData(peer: Peer) {
  let retry = false;
  const next = () => {
    if (peer.toSend.length > 0) {
      const message = peer.toSend.shift();
      const index = message!.payload!.readInt32BE(0);
      const begin = message!.payload!.readInt32BE(4);
      const length = message!.payload!.readInt32BE(8);

      peer.torrent!.requestChunk(index, begin, length, (err, data) => {
        if (err) {
          if (err.code === 0 /* Piece.ERR_FILEBUSY */) {
            LOGGER.warn(
              "Peer [" + peer.getIdentifier() + "] sendData file busy"
            );
            retry = true;
            peer.toSend.push(message!);
          } else {
            LOGGER.error("Failed to read file chunk: " + err);
            throw err;
          }
        } else {
          if (data) {
            const msgBuffer = Buffer.alloc(8 + data.length);
            msgBuffer.writeInt32BE(index, 0);
            msgBuffer.writeInt32BE(begin, 4);
            data.copy(msgBuffer, 8);
            peer.sendMessage(new Message(MessageCode.PIECE, msgBuffer));
            peer.uploaded += data.length;
            updateRates(peer, "up");
          } else {
            LOGGER.debug(
              "No data found for request, index = " +
                index +
                ", begin = " +
                begin
            );
          }
          ProcessUtils.nextTick(next);
        }
      });
    } else {
      peer.sending = false;
      if (retry) {
        setTimeout(function () {
          if (!peer.sending) {
            peer.sending = true;
            sendData(peer);
          }
        }, 10);
      }
    }
  };
  next();
}

function processData(peer: Peer) {
  let offset = 0;
  peer.processing = true;

  function done() {
    if (offset > 0) {
      peer.data = peer.data.slice(offset);
    }
    peer.processing = false;
  }

  do {
    if (peer.data.length - offset >= 4) {
      const messageLength = peer.data.readInt32BE(offset);
      offset += 4;
      if (messageLength === 0) {
        LOGGER.debug("Peer [%s] sent keep alive", peer.getIdentifier());
      } else if (peer.data.length - offset >= messageLength) {
        // Have everything we need to process a message
        const code = peer.data[offset];
        const payload =
          messageLength > 1
            ? peer.data.slice(offset + 1, offset + messageLength)
            : null;
        offset += messageLength;

        const message = new Message(code!, payload);
        switch (message.code) {
          case MessageCode.CHOKE:
            LOGGER.debug("Peer [%s] sent CHOKE", peer.getIdentifier());
            peer.debugStatus += "choke:";
            peer.choked = true;
            peer.emit(PeerEvent.CHOKED);
            break;

          case MessageCode.UNCHOKE:
            LOGGER.debug(
              "Peer [%s] sent UNCHOKE, interested = %j",
              peer.getIdentifier(),
              peer.amInterested
            );
            peer.debugStatus += "unchoke:";
            peer.choked = false;
            if (peer.isReady()) {
              peer.emit(PeerEvent.READY, peer);
            }
            break;

          case MessageCode.INTERESTED:
            LOGGER.debug("Peer [%s] sent INTERESTED", peer.getIdentifier());
            peer.interested = true;
            // TODO: choke/unchoke handling
            // self.sendMessage(new MessageCode(MessageCode.UNCHOKE));
            // LOGGER.info('Sent UNCHOKE to ' + self.getIdentifier());
            break;

          case MessageCode.UNINTERESTED:
            LOGGER.debug("Peer [%s] sent UNINTERESTED", peer.getIdentifier());
            peer.interested = false;
            break;

          case MessageCode.HAVE:
            LOGGER.debug("Peer [%s] sent HAVE", peer.getIdentifier());
            const piece = message.payload!.readInt32BE(0);
            peer.bitfield!.set(piece);
            peer.emit(PeerEvent.UPDATED);
            break;

          case MessageCode.BITFIELD: {
            LOGGER.debug("Peer [%s] sent BITFIELD", peer.getIdentifier());
            peer.bitfield = new BitField(
              message.payload!,
              message.payload!.length
            ); // TODO: figure out nicer way of handling bitfield lengths
            peer.emit(PeerEvent.UPDATED);
            break;
          }

          case MessageCode.REQUEST:
            LOGGER.debug("Peer [%s] sent REQUEST", peer.getIdentifier());
            peer.toSend.push(message);
            if (!peer.sending) {
              peer.sending = true;
              setTimeout(function () {
                sendData(peer);
              }, 10);
            }
            break;

          case MessageCode.PIECE: {
            LOGGER.debug("Peer [%s] sent PIECE", peer.getIdentifier());

            const index = message.payload!.readInt32BE(0);
            const begin = message.payload!.readInt32BE(4);
            const data = message.payload!.slice(8);

            const piece = peer.pieces[index];
            if (piece) {
              piece.setData(data, begin);

              peer.downloaded += data.length;

              delete peer.requests[index]![begin];
              peer.requestsCount[index]!--;
              peer.numRequests--;

              updateRates(peer, "down");
              peer.requestPiece(piece);
            } else {
              LOGGER.debug(
                "Peer [%s] received chunk for inactive piece",
                peer.getIdentifier()
              );
            }

            break;
          }

          case MessageCode.CANCEL:
            LOGGER.debug("Ignoring CANCEL");
            break;

          case MessageCode.PORT:
            LOGGER.debug("Ignoring PORT");
            break;

          case MessageCode.EXTENDED: {
            LOGGER.debug("Received EXTENDED from " + Peer.getIdentifier(peer));

            const extendedCode = message.payload![0];
            const data = message.payload!.slice(1);
            let payload = null;
            if (extendedCode === 0) {
              payload = bencode.decode<{
                m: Record<string, number>;
                metadata_size: number;
              }>(data.toString("binary"));
              peer._extensionData = payload;
              LOGGER.debug(
                "Peer [%s] supports extensions %j",
                peer.getIdentifier(),
                payload
              );
              peer.emit(PeerEvent.EXTENSIONS_UPDATED);
            } else {
              LOGGER.debug(
                "Peer [%s] received extended code %d",
                peer.getIdentifier(),
                extendedCode
              );
              peer.emit(PeerEvent.EXTENDED, peer, extendedCode, data);
            }
            break;
          }

          default:
            LOGGER.warn(
              "Peer [" +
                peer.getIdentifier() +
                "] received unknown message, disconnecting. "
            );
            peer.disconnect("Unknown message received.");
            // stop processing
            done();
            return;
        }
      } else {
        // not enough data, stop processing until more data arrives
        offset -= 4;
        done();
        return;
      }
    } else {
      // not enough data to read the message length, stop processing until more data arrives
      done();
      if (!peer.running) {
        peer.running = true;
        ProcessUtils.nextTick(function () {
          nextMessage(peer);
        });
      }
      return;
    }
  } while (true);
}

function setKeepAlive(peer: Peer) {
  if (!peer.keepAliveId) {
    peer.keepAliveId = setInterval(function () {
      LOGGER.debug("keepAlive tick");
      if (peer.stream && peer.stream.writable) {
        const message = new Message(MessageCode.KEEPALIVE);
        message.writeTo(peer.stream);
      } else {
        clearInterval(peer.keepAliveId);
      }
    }, KEEPALIVE_PERIOD);
  }
}

// calculate weighted average upload/download rate
function calculateRate(peer: Peer, kind: string) {
  const isUpload = kind == "up";

  const rates = isUpload ? peer.uploadRates : peer.downloadRates;

  // take the last recorded rate
  //  const rate = (rates.length > 0) ? rates[rates.length-1].value : 0

  // calculate weighted average rate
  //const decayFactor = 0.13863;
  let rateSum = 0;
  let weightSum = 0;
  for (let idx = 0; idx < rates.length; idx++) {
    //const age = rates[idx].ts-rates[0].ts;
    const weight = 1; //Math.exp(-decayFactor*age/1000);
    rateSum += rates[idx]!.value * weight;
    weightSum += weight;
  }
  const rate = rates.length > 0 ? rateSum / weightSum : 0;

  if (rate > 0) {
    LOGGER.debug(
      "Peer [" + peer.getIdentifier() + "] " + kind + "loading at " + rate
    );
  }

  if (isUpload) {
    peer.emit(PeerEvent.RATE_UPDATE, {
      type: "upload",
      previous: peer.currentUploadRate,
      current: rate,
    });
    peer.currentUploadRate = rate;
  } else {
    peer.emit(PeerEvent.RATE_UPDATE, {
      type: "download",
      previous: peer.currentDownloadRate,
      current: rate,
    });
    peer.currentDownloadRate = rate;
  }
}

function updateRates(peer: Peer, kind: string) {
  const isUpload = kind == "up";

  const history = isUpload ? peer.uploadedHistory : peer.downloadedHistory;
  const rates = isUpload ? peer.uploadRates : peer.downloadRates;

  const now = Date.now();
  const bytes = isUpload ? peer.uploaded : peer.downloaded;
  history.push({ ts: now, value: bytes });

  if (history.length > 1) {
    const start = history[0]!.ts;
    if (now - start > 1 * 1000) {
      // calculate a new rate and remove first entry from history
      const rate = ((bytes - history.shift()!.value) / (now - start)) * 1000;
      rates.push({ ts: now, value: rate });
      // throw out any rates that are too old to be of interest
      while (rates.length > 1 && now - rates[0]!.ts > 3 * 1000) {
        rates.shift();
      }
      // re-calculate current upload/download rate
      calculateRate(peer, kind);
    } else {
      // just want to keep the first and the last entry in history
      history.splice(1, 1);
    }
  }
}

export enum PeerEvent {
  CHOKED = "choked",
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  READY = "ready",
  UPDATED = "updated",
  EXTENDED = "extended",
  EXTENSIONS_UPDATED = "peer:extensions_updated",
  RATE_UPDATE = "peer:rate_update",
}

export default Peer;
