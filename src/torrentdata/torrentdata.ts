import { parse } from "url";
import Metadata from "../metadata";
import { createTrackers } from "../tracker/tracker";

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
  async load(url: string) {
    const parsedUrl = parse(url);
    const protocol = parsedUrl.protocol || "file:";

    const loader =
      protocol in loaders ? loaders[protocol as keyof typeof loaders] : null;

    if (!loader) {
      throw new Error("No metadata parser for given URL, URL = " + url);
    }

    const torrentData = await loader.load(url);

    return [
      new Metadata(torrentData!.infoHash, torrentData!.info),
      createTrackers(torrentData.announce, torrentData["announce-list"]),
    ] as const;
  },
};

export default TorrentData;
