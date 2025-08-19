import { parse } from "url";
import Metadata from "../metadata";
import Tracker, { createTrackers } from "../tracker/tracker";

import http from "./http";
import file from "./file";
import magnet from "./magnet";

const loaders = {
  "http:": http,
  "https:": http,
  "file:": file,
  "magnet:": magnet,
};

const TorrentData = {
  load: (
    url: string,
    callback: (
      error: any,
      metadata?: Metadata,
      trackers?: Array<Tracker>
    ) => void
  ) => {
    const parsedUrl = parse(url);
    const protocol = parsedUrl.protocol || "file:";
    const loader =
      protocol in loaders ? loaders[protocol as keyof typeof loaders] : null;

    if (!loader) {
      callback(new Error("No metadata parser for given URL, URL = " + url));
    } else {
      loader.load(url, (error, torrentData) => {
        if (error) {
          callback(error);
        } else {
          callback(
            null,
            new Metadata(torrentData!.infoHash, torrentData!.info),
            createTrackers(
              torrentData!["announce"]!,
              torrentData!["announce-list"]
            )
          );
        }
      });
    }
  },
};

export default TorrentData;
