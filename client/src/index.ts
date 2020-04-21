import * as stream from 'stream';
import * as repl from 'repl';
import { promisify, inspect } from 'util';

import got from 'got';
import * as env from 'env-var';

import { toKeyword, EDNVal, EDNKeyword, tagValue } from './edn';
import { CruxMap, setupCrux, cruxIdKeyword } from './crux';
import { departmentTitles } from './hospitalData';

const pipeline = promisify(stream.pipeline);

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
};


class CountTxStream extends stream.Writable {
  count = 0;
  constructor() {
    super({ objectMode: true });
  }
  _write(chunk, encoding, callback) {
    this.count += chunk['crux.tx.event/tx-events'].length;
    callback();
  }
}

class LimitedStream extends stream.Transform {
  count = 0;
  _transform(chunk, encoding, callback) {
    if (this.count < 1) {
      this.push(null);
    } else {
      this.push(chunk);
    }
    this.count--;
    callback();
  }
}
const limitObjectStream = (count: number) => {
  const s = new LimitedStream({
    objectMode: true,
  });
  s.count = count;
  return s;
};

const run = async () => {
  try {
    const crux = setupCrux({
      prefixUrl: env
        .get('CRUX_URL')
        .default('http://localhost:3000')
        .asUrlString(),
    });
  } catch (error) {
    if (error instanceof got.HTTPError || error instanceof got.ParseError) {
      console.log(error.response.body);
    }

    console.log(error);
  }
};

run();
