import { readFile } from "node:fs/promises";
import * as bencode from "../util/bencode";
import type { Metadata } from "./types";

const LOGGER = require("log4js").getLogger("metadata/file.js");

/**
 * Retrieve torrent metadata from the filesystem.
 */
const FileMetadata = {
  async load(url: string) {
    const path = url.match(/^file:/) ? url.substring(7) : url;

    LOGGER.debug("Reading file metadata from " + path);

    const data = await readFile(path, "binary");
    // @ts-expect-error
    const metadata = bencode.decode<Metadata>(data.toString());
    return {
      ...metadata,
      "announce-list": metadata["announce-list"]?.flatMap((urls) => urls),
    };
  },
};

export default FileMetadata;
