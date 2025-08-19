import type Torrent from "../torrent/torrent";
import { parse, type UrlWithStringQuery } from "url";
import protocol from "./protocol";

const EventEmitter = require("events").EventEmitter;

const LOGGER = require("log4js").getLogger("tracker.js");

const CONNECTING = "connecting";
const ERROR = "error";
const STOPPED = "stopped";
const WAITING = "waiting";

const ANNOUNCE_START_INTERVAL = 5;

type Callback = (peerId: string, peerIp: string, peerPort: number) => void;

class Tracker extends EventEmitter {
  private _urls: Array<string>;
  public url: UrlWithStringQuery;

  public torrent: Torrent | null;

  public callback: Callback | undefined;

  constructor(urls: [string, ...string[]]) {
    super();
    EventEmitter.call(this);

    this._urls = urls;
    // TODO: need to step through URLs as part of announce process
    this.url = parse(this._urls[0]!);
    this.torrent = null;
    this.state = STOPPED;
    this.seeders = 0;
    this.leechers = 0;
  }

  setTorrent(torrent: Torrent) {
    this.torrent = torrent;
  }

  start(callback: Callback) {
    this.callback = callback;
    this._announce("started");
  }

  stop() {
    this._announce("stopped");
  }

  private _announce(event: "started" | "stopped" | null) {
    LOGGER.debug("Announce" + (event ? " " + event : ""));

    const handlerClass = protocol[this.url.protocol! as keyof typeof protocol];

    if (handlerClass) {
      const handler = new handlerClass();
      const data = {
        peer_id: this.torrent!.clientId,
        info_hash: this.torrent!.infoHash!,
        port: this.torrent!.clientPort,
      };

      this.state = CONNECTING;
      handler.handle(this, data, event, (info, error) => {
        if (error) {
          LOGGER.warn(
            "announce error from " + this.url.href + ": " + error.message
          );
          this.state = ERROR;
          this.errorMessage = error.message;
          if (event === "started") {
            LOGGER.warn(
              "retry announce 'started' in " + ANNOUNCE_START_INTERVAL + "s"
            );
            setTimeout(() => {
              this._announce("started");
            }, ANNOUNCE_START_INTERVAL * 1000);
          }
        } else {
          if (info!.trackerId) {
            this.trackerId = info!.trackerId;
          }
          this.state = WAITING;
          if (event === "started") {
            const interval = info!.interval;
            if (this.timeoutId) {
              clearInterval(this.timeoutId);
            }
            if (interval) {
              this.timeoutId = setInterval(() => {
                this._announce(null);
              }, interval * 1000);
            }
          } else if (event === "stopped") {
            clearInterval(this.timeoutId);
            delete this.timeoutId;
            this.state = STOPPED;
          }
        }
        this._updateInfo(info!);
      });
    }
  }

  private _updateInfo(data: {
    peers?: Array<{ peer_id?: string; ip: string; port: number }>;
    seeders?: number;
    leechers?: number;
  }) {
    LOGGER.debug(
      "Updating details from tracker. " +
        (data && data.peers ? data.peers.length : 0) +
        " new peers"
    );
    if (data) {
      this.seeders = data.seeders || 0;
      this.leechers = data.leechers || 0;
      if (data.peers) {
        for (let i = 0; i < data.peers.length; i++) {
          const peer = data.peers[i]!;
          this.callback!(peer.peer_id!, peer.ip, peer.port);
        }
      }
      this.emit("updated");
    }
  }
}

export const createTrackers = (
  announce: string | undefined,
  announceList?: Array<string>
) => {
  const trackers = [];
  if (announceList) {
    announceList.forEach((announce) => {
      trackers.push(new Tracker([announce]));
    });
  } else {
    trackers.push(new Tracker([announce!]));
  }
  return trackers;
};

export default Tracker;
