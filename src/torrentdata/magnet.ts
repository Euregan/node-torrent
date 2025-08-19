import base32 from "base32";
import { parse } from "url";
import type { Metadata } from "./types";

const LOGGER = require("log4js").getLogger("metadata/magnet.js");

/**
 * Retrieve torrent metadata from magnet URL.
 */
const MagnetMetadata = {
  async load(url: string) {
    if (!url.match(/^magnet:/)) {
      throw new Error("Given URL is not a magnet URL.");
    }

    LOGGER.debug("Reading magnet metadata from " + url);

    const parsedUrl = parse(url, true);
    let hash: string | null = null;

    const urns = parsedUrl.query.xt
      ? Array.isArray(parsedUrl.query.xt)
        ? parsedUrl.query.xt
        : [parsedUrl.query.xt]
      : [];

    for (const urn of urns) {
      if (urn.match(/^urn:btih:/)) {
        hash = urn.substring(9);
        break;
      }
    }

    if (!hash) {
      throw new Error("No supported xt URN provided.");
    } else {
      let infoHash;
      if (hash.length === 40) {
        infoHash = Buffer.alloc(40, hash, "hex");
      } else {
        infoHash = Buffer.alloc(
          Buffer.byteLength(base32.decode(hash)),
          base32.decode(hash),
          "binary"
        );
      }

      let trackers;
      if (parsedUrl.query.tr) {
        trackers = parsedUrl.query.tr;
        if (!Array.isArray(trackers)) {
          trackers = [trackers];
        }
      }

      return {
        infoHash: infoHash,
        info: {
          name: parsedUrl.query.dn as string,
        },
        "announce-list": trackers ?? [],
      } as Metadata;
    }
  },
};

export default MagnetMetadata;
