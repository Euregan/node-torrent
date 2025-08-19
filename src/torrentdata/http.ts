import http from "http";
import https from "https";
import zlib from "zlib";
import * as bencode from "../util/bencode";
import type { Metadata } from "./Metadata";

const LOGGER = require("log4js").getLogger("metadata/http.js");

/**
 * Retrieve torrent metadata over http/https.
 */
const HttpMetadata = {
  load: (url: string, callback: (error: any, metadata?: Metadata) => void) => {
    if (!url.match(/^https?:/)) {
      callback(new Error("Given URL is not an http URL."));
    }

    LOGGER.debug("Reading http metadata from " + url);

    const request = url.match(/^http:/) ? http : https;

    request
      .get(url, (response) => {
        LOGGER.debug(
          "Response recieved from metadata request.  status = " +
            response.statusCode
        );

        const buffers: Array<Uint8Array> = [];
        let length = 0;

        response.on("data", (chunk) => {
          buffers.push(chunk);
          length += chunk.length;
        });

        response.on("end", () => {
          // Handles decoded torrent metadata
          const loadMetadata = (error: any, decoded: Buffer) => {
            if (!error) {
              try {
                const metadata = bencode.decode(decoded.toString("binary"));
                callback(null, metadata);
              } catch (error) {
                callback(error);
              }
            } else {
              callback(error);
            }
          };

          if (response.statusCode === 200) {
            const body = Buffer.concat(buffers, length);

            switch (response.headers["content-encoding"]) {
              // or, just use zlib.createUnzip() to handle both cases
              case "gzip":
                zlib.gunzip(body, loadMetadata);
                break;
              case "deflate":
                zlib.deflate(body, loadMetadata);
                break;
              default:
                loadMetadata(null, body);
                break;
            }
          } else if (
            response.statusCode! >= 300 &&
            response.statusCode! < 400
          ) {
            const location = response.headers["location"];
            if (location) {
              HttpMetadata.load(location, callback);
            } else {
              callback(
                new Error(
                  "Received redirect response with no location header. status = " +
                    response.statusCode
                )
              );
            }
          } else {
            callback(
              new Error(
                "Unknown response code recieved from metadata request. code = " +
                  response.statusCode
              )
            );
          }
        });
      })
      .on("error", (error) => {
        callback(error);
      });
  },
};

export default HttpMetadata;
