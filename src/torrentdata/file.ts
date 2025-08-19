import fs from "fs";
import * as bencode from "../util/bencode";
import type { Metadata } from "./Metadata";

const LOGGER = require("log4js").getLogger("metadata/file.js");

/**
 * Retrieve torrent metadata from the filesystem.
 */
const FileMetadata = {
  load: function (
    url: string,
    callback: (error: any, metadata?: Metadata) => void
  ) {
    const path = url.match(/^file:/) ? url.substring(7) : url;

    LOGGER.debug("Reading file metadata from " + path);

    fs.readFile(path, "binary", (error, data) => {
      if (error) {
        callback(error);
      } else {
        try {
          const metadata = bencode.decode(data.toString());
          callback(null, metadata);
        } catch (e) {
          callback(e);
        }
      }
    });
  },
};

export default FileMetadata;
