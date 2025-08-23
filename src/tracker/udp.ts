import { createSocket, Socket, type RemoteInfo } from "dgram";
import * as BufferUtils from "../util/bufferutils";
import type Tracker from "./tracker";
import type { Callback, Data, TrackerInfo } from "./types";

const CONNECTION_ID = BufferUtils.concat(
  BufferUtils.fromInt(0x417),
  BufferUtils.fromInt(0x27101980)
);

const LOGGER = require("log4js").getLogger("udp.js");
LOGGER.level = "debug";

// Actions
const Action = {
  CONNECT: 0,
  ANNOUNCE: 1,
  SCRAPE: 2,
  ERROR: 3,
};

class UDP {
  public callback: Callback | null = null;
  public connectionId: Buffer<ArrayBuffer> | null = null;
  public data: Data | null = null;
  public event: string | null = null;
  public socket: Socket | null = null;
  public tracker: Tracker | null = null;
  public transactionId: Buffer<ArrayBuffer> | null = null;
  public resolvedIp: string | null = null;

  handle(
    tracker: Tracker,
    data: Data | null,
    event: string | null,
    callback: Callback
  ) {
    this.tracker = tracker;
    this.data = data;
    this.event = event;
    this.callback = callback;

    this.socket = createSocket("udp4", (msg, rinfo) => {
      this._handleMessage(msg, rinfo);
    }).on("error", (error) => {
      this._complete(null, new Error(error.message));
    });
    this._connect();
  }

  private _announce() {
    LOGGER.debug(
      "Sending announce request to UDP tracker at " +
        this.tracker!.url.hostname +
        ":" +
        this.tracker!.url.port
    );
    this._generateTransactionId();
    const packet = BufferUtils.concat(
      this.connectionId!,
      BufferUtils.fromInt(Action.ANNOUNCE),
      this.transactionId!,
      this.data!["info_hash"],
      this.data!["peer_id"],
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(this.data!["downloaded"] || 0), // int64, TODO: split data into two parts etc
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(this.data!["left"] || 0), // 64
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(this.data!["uploaded"] || 0), //64
      // @ts-expect-error
      BufferUtils.fromInt(this.event!),
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(Math.random() * 255),
      BufferUtils.fromInt(200),
      BufferUtils.fromInt16(this.data!["port"])
    );
    this._send(packet);
  }

  private _announceResponse(msg: Buffer<ArrayBufferLike>) {
    const trackerInfo: TrackerInfo = {
      interval: BufferUtils.readInt(msg, 8),
      leechers: BufferUtils.readInt(msg, 12),
      seeders: BufferUtils.readInt(msg, 16),
      peers: [],
    };

    for (let i = 20; i < msg.length; i += 6) {
      const ip =
        msg[i] + "." + msg[i + 1] + "." + msg[i + 2] + "." + msg[i + 3];
      const port = (msg[i + 4]! << 8) | msg[i + 5]!;
      LOGGER.debug("Parsed peer with details: " + ip + ":" + port);
      trackerInfo.peers.push({ ip: ip, port: port });
    }

    this._complete(trackerInfo);
  }

  private _complete(trackerInfo: TrackerInfo | null, err?: any) {
    try {
      this.socket!.close();
    } catch (e) {}
    this.callback!(trackerInfo, err);
  }

  private _connect() {
    LOGGER.debug(
      "sending connect request to UDP tracker at " +
        this.tracker!.url.hostname +
        ":" +
        this.tracker!.url.port
    );
    this._generateTransactionId();
    const packet = BufferUtils.concat(
      CONNECTION_ID,
      BufferUtils.fromInt(Action.CONNECT),
      this.transactionId!
    );
    this._send(packet);
  }

  private _generateTransactionId() {
    LOGGER.debug("generating transaction id");
    const id = Buffer.alloc(4);
    id[0] = Math.random() * 255;
    id[1] = Math.random() * 255;
    id[2] = Math.random() * 255;
    id[3] = Math.random() * 255;
    this.transactionId = id;
  }

  private _handleMessage(msg: Buffer<ArrayBufferLike>, remoteInfo: RemoteInfo) {
    LOGGER.debug("handling message from tracker");
    const action = BufferUtils.readInt(msg);
    const responseTransactionId = BufferUtils.slice(msg, 4, 8);

    if (BufferUtils.equal(responseTransactionId, this.transactionId!)) {
      console.log(remoteInfo);
      this.resolvedIp = remoteInfo.address;
      LOGGER.debug("transactionIds equals, action = " + action);
      switch (action) {
        case Action.CONNECT:
          this.connectionId = BufferUtils.slice(msg, 8, 16);
          LOGGER.debug(
            "Received connectionId from server, id = " + this.connectionId
          );
          this._announce();
          break;
        case Action.ANNOUNCE:
          LOGGER.debug("Received announce response.");
          this._announceResponse(msg);
          break;
        case Action.SCRAPE:
          break;
        case Action.ERROR:
          LOGGER.debug("Received error from server.");
          const message = BufferUtils.slice(msg, 8, msg.length);
          this._complete(null, new Error(message.toString("utf8")));
          break;
        default:
          LOGGER.warn(
            "Unknown action received from server.  Action = " + action
          );
      }
    } else {
      this._complete(
        null,
        new Error("Received invalid transactionId from server.")
      );
    }
  }

  private _send(packet: Buffer<ArrayBuffer>) {
    const self = this;
    const host = this.resolvedIp || this.tracker!.url.hostname;
    this.socket!.send(
      packet,
      0,
      packet.length,
      Number(this.tracker!.url.port),
      host!,
      (err) => {
        LOGGER.debug("packet sent, err = ", err);
        if (err) {
          self._complete(null, err);
        }
      }
    );
  }
}

export default UDP;
