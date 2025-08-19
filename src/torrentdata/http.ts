import http from "http";
import https from "https";
import zlib from "zlib";
import * as bencode from "../util/bencode";
import type { Metadata } from "./types";

const LOGGER = require("log4js").getLogger("metadata/http.js");

/**
 * Retrieve torrent metadata over http/https.
 */
const HttpMetadata = {
  load: (url: string) =>
    new Promise<Metadata>((resolve, reject) => {
      if (!url.match(/^https?:/)) {
        reject(new Error("Given URL is not an http URL."));
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
                  // @ts-expect-error
                  const metadata = bencode.decode<Metadata>(
                    decoded.toString("binary")
                  );
                  resolve({
                    ...metadata,
                    "announce-list": metadata["announce-list"]?.flatMap(
                      (urls) => urls
                    ),
                  });
                } catch (error) {
                  reject(error);
                }
              } else {
                reject(error);
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
                HttpMetadata.load(location).then(resolve).catch(reject);
              } else {
                reject(
                  new Error(
                    "Received redirect response with no location header. status = " +
                      response.statusCode
                  )
                );
              }
            } else {
              reject(
                new Error(
                  "Unknown response code recieved from metadata request. code = " +
                    response.statusCode
                )
              );
            }
          });
        })
        .on("error", (error) => {
          reject(error);
        });
    }),
};

export default HttpMetadata;
