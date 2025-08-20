import zlib from "zlib";
import util from "util";
import * as bencode from "../util/bencode";
import type { Metadata } from "./types";

const deflate = util.promisify(zlib.deflate);
const gunzip = util.promisify(zlib.gunzip);

const LOGGER = require("log4js").getLogger("metadata/http.js");

/**
 * Retrieve torrent metadata over http/https.
 */
const HttpMetadata = {
  async load(url: string): Promise<Metadata> {
    if (!url.match(/^https?:/)) {
      throw new Error("Given URL is not an http URL.");
    }

    LOGGER.debug("Reading http metadata from " + url);

    const response = await fetch(url);
    LOGGER.debug(
      "Response recieved from metadata request.  status = " + response.status
    );

    const buffers = await response.arrayBuffer();

    if (response.status === 200) {
      let decoded: Buffer<ArrayBufferLike>;

      switch (response.headers.get("content-encoding")) {
        // or, just use zlib.createUnzip() to handle both cases
        case "gzip":
          decoded = await gunzip(buffers);
          break;
        case "deflate":
          decoded = await deflate(buffers);
          break;
        default:
          decoded = Buffer.from(buffers);
          break;
      }

      // @ts-expect-error
      const metadata = bencode.decode<Metadata>(decoded.toString("binary"));

      return {
        ...metadata,
        "announce-list": metadata["announce-list"]?.flatMap((urls) => urls),
      };
    } else if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        return HttpMetadata.load(location);
      } else {
        throw new Error(
          "Received redirect response with no location header. status = " +
            response.status
        );
      }
    } else {
      throw new Error(
        "Unknown response code received from metadata request. code = " +
          response.status
      );
    }
  },
};

export default HttpMetadata;
