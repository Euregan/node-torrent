import File from "../file";
import fs from "fs";
import path from "path";
import * as ProcessUtils from "../util/processutils";

/**
 * Create files defined in the given metadata.
 */
const createFiles = (
  downloadPath: string,
  metadata: { name: string; length: number; files: Array<File> },
  callback: (error: any | null, files?: Array<File>, length?: number) => void
) => {
  const basePath = path.join(downloadPath, metadata.name);

  if (metadata.length) {
    const file = new File(basePath, metadata.length, null, (error) => {
      if (error) {
        callback(new Error("Error creating file, error = " + error));
      } else {
        callback(null, [file], metadata.length);
      }
    });
  } else {
    makeDirectory(basePath, (error) => {
      if (error) {
        callback(error);
      } else {
        nextFile(basePath, metadata.files, [], 0, callback);
      }
    });
  }
};

const nextFile = (
  basePath: string,
  files: Array<File>,
  processedFiles: Array<File>,
  offset: number,
  callback: (
    error: any | null,
    processedFiles?: Array<File>,
    offset?: number
  ) => void
) => {
  if (files.length === 0) {
    callback(null, processedFiles, offset);
  } else {
    const file = files.shift()!;
    const pathArray = file.path.split("/");
    checkPath(basePath, pathArray, (error, filePath) => {
      if (error) {
        callback(error);
      } else {
        processedFiles.push(
          new File(
            path.join(filePath!, pathArray[0]!),
            file.length,
            offset,
            (error) => {
              if (error) {
                callback(new Error("Error creating file, error = " + error));
              } else {
                offset += file.length;
                ProcessUtils.nextTick(() => {
                  nextFile(basePath, files, processedFiles, offset, callback);
                });
              }
            }
          )
        );
      }
    });
  }
};

const checkPath = (
  basePath: string,
  pathArray: Array<string>,
  callback: (error: null | any, path?: string) => void
) => {
  if (pathArray.length === 1) {
    callback(null, basePath);
  } else {
    const currentPath = path.join(basePath, pathArray.shift()!);
    makeDirectory(currentPath, (error) => {
      if (error) {
        callback(error);
      } else {
        checkPath(currentPath, pathArray, callback);
      }
    });
  }
};

const makeDirectory = (path: string, callback: (error: null | any) => void) => {
  fs.exists(path, (pathExists) => {
    if (!pathExists) {
      fs.mkdir(path, 0o777, (error) => {
        if (error) {
          return callback(
            new Error("Couldn't create directory. error = " + error)
          );
        }
        callback(null);
      });
    } else {
      callback(null);
    }
  });
};

export default createFiles;
