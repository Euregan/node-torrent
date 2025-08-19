import bencode = require("../util/bencode");
import http = require("http");
import type Tracker from "./tracker";
import type { Callback, Data, TrackerInfo } from "./types";

const LOGGER = require("log4js").getLogger("http.js");

type Response =
  | {
      "failure reason": string;
    }
  | {
      "tracker id": string;
      interval: number;
      complete: number;
      incomplete: number;
      peers?:
        | string
        | Array<{
            ip: string;
            port: number;
          }>;
    };

class HTTP {
  public callback: Callback | null = null;
  public data: Data | null = null;
  public event: string | null = null;
  public tracker: Tracker | null = null;

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

    this._makeRequest();
  }

  private _complete(trackerInfo: TrackerInfo | null, err?: any) {
    this.callback!(trackerInfo, err);
  }

  private _makeRequest() {
    let query =
      "?info_hash=" +
        escape(this.data!["info_hash"].toString()) +
        "&peer_id=" +
        escape(this.data!["peer_id"].toString()) +
        "&port=" +
        this.data!["port"] +
        "&uploaded=" +
        this.data!["uploaded"] +
        "&downloaded=" +
        this.data!["downloaded"] +
        "&left=" +
        this.data!["left"] +
        "&compact=1" +
        "&numwant=200" +
        "&event=" +
        this.event || "empty";

    if (this.tracker!.trackerId) {
      query += "&trackerid=" + this.tracker!.trackerId;
    }

    const options = {
      host: this.tracker!.url.hostname,
      path: this.tracker!.url.pathname + query,
      port: this.tracker!.url.port,
    };

    const self = this;

    const req = http.get(options, (res) => {
      const buffers: Array<Buffer> = [];
      let length = 0;
      res.on("data", (chunk) => {
        buffers.push(chunk);
        length += chunk.length;
      });
      res.on("end", () => {
        const body = Buffer.alloc(length);
        let pos = 0;
        for (let i = 0; i < buffers.length; i++) {
          body.write(buffers[i]!.toString("binary"), pos, "binary");
          pos += buffers[i]!.length;
        }
        if (res.statusCode === 200) {
          const response = bencode.decode<Response>(body.toString("binary"));
          self._parseResponse(response);
        } else {
          LOGGER.debug(
            "Unexpected status code: " +
              res.statusCode +
              ", response: " +
              body.toString()
          );
          self._complete(
            null,
            new Error(
              "Unexpected status code: " +
                res.statusCode +
                ", response: " +
                body.toString()
            )
          );
        }
      });
    });
    req.on("error", (e) => {
      self._complete(null, new Error(e.message));
    });
  }

  private _parseResponse(response: Response) {
    LOGGER.debug("parsing response from tracker");
    if ("failure reason" in response) {
      this._complete(null, new Error(response["failure reason"]));
    } else {
      const trackerInfo: TrackerInfo = {
        trackerId: response["tracker id"],
        interval: response["interval"],
        seeders: response.complete,
        leechers: response.incomplete,
        peers: [],
      };

      if (response.peers) {
        if (typeof response.peers === "string") {
          const peers = Buffer.alloc(
            Buffer.byteLength(response.peers),
            response.peers,
            "binary"
          );
          for (let i = 0; i < peers.length; i += 6) {
            const ip =
              peers[i] +
              "." +
              peers[i + 1] +
              "." +
              peers[i + 2] +
              "." +
              peers[i + 3];
            const port = (peers[i + 4]! << 8) | peers[i + 5]!;
            LOGGER.debug("Parsed peer ip:" + ip + ", port: " + port);
            trackerInfo.peers.push({
              ip: ip,
              port: port,
            });
          }
        } else {
          trackerInfo.peers = response.peers;
        }
      }

      this._complete(trackerInfo);
    }
  }
}

export default HTTP;
