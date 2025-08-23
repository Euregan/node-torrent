import File from "../file";
import * as fs from "fs";
import { join } from "path";
import * as ProcessUtils from "../util/processutils";

/**
 * Create files defined in the given metadata.
 */
const createFiles = (
  downloadPath: string,
  metadata: {
    name: string;
    length?: number;
    files?: Array<{ length: number; path: Array<string> }>;
  }
) =>
  new Promise<[Array<File>, number]>((resolve, reject) => {
    const basePath = join(downloadPath, metadata.name);

    if (metadata.length) {
      const file = new File(basePath, metadata.length, null, (error) => {
        if (error) {
          reject(new Error("Error creating file, error = " + error));
        } else {
          resolve([[file], metadata.length!]);
        }
      });
    } else {
      makeDirectory(basePath, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(nextFile(basePath, metadata.files!, [], 0));
        }
      });
    }
  });

const nextFile = async (
  basePath: string,
  files: Array<{ length: number; path: Array<string> }>,
  processedFiles: Array<File>,
  offset: number
) =>
  new Promise<[Array<File>, number]>((resolve, reject) => {
    if (files.length === 0) {
      resolve([processedFiles, offset]);
    } else {
      const file = files.shift()!;
      const pathArray = file.path[0]!.split("/");

      checkPath(basePath, pathArray, (error, filePath) => {
        if (error) {
          reject(error);
        } else {
          processedFiles.push(
            new File(
              join(filePath!, pathArray[0]!),
              file.length,
              offset,
              (error) => {
                if (error) {
                  reject(new Error("Error creating file, error = " + error));
                } else {
                  offset += file.length;
                  ProcessUtils.nextTick(() => {
                    resolve(nextFile(basePath, files, processedFiles, offset));
                  });
                }
              }
            )
          );
        }
      });
    }
  });

const checkPath = (
  basePath: string,
  pathArray: Array<string>,
  callback: (error: null | any, path?: string) => void
) => {
  if (pathArray.length === 1) {
    callback(null, basePath);
  } else {
    const currentPath = join(basePath, pathArray.shift()!);
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
