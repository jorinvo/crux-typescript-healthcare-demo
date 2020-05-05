import * as stream from 'stream';
import * as repl from 'repl';
import { promisify, inspect } from 'util';

import * as env from 'env-var';

import { setupCrux, putTx, deleteTx, evictTx, toCruxDoc } from './crux';

const pipeline = promisify(stream.pipeline);

const crux = setupCrux({
  prefixUrl: env.get('CRUX_URL').default('http://localhost:3000').asUrlString(),
});

class CountStream extends stream.Writable {
  count = 0;
  constructor() {
    super({ objectMode: true });
  }
  _write(chunk, encoding, callback) {
    this.count++;
    callback();
  }
}
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

const demo = {
  async countLogEvents() {
    const countStream = new CountTxStream();
    await pipeline(await crux.readTxLog(), countStream);
    return countStream.count;
  },

  async countPatients() {
    const countStream = new CountStream();
    await pipeline(
      await crux.queryStream({
        find: ['id'],
        where: [['id', 'patientId', '_']],
      }),
      countStream,
    );
    return countStream.count;
  },
};

let evalStartTime: number;
const replServer = repl.start({
  breakEvalOnSigint: true,
  prompt: process.stdin.isTTY ? '> ' : '',
  writer(output) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return JSON.stringify(output, null, 2);
    }
    const now = Date.now();
    const diff = now - evalStartTime;
    const o = inspect(output, { depth: 5, colors: true });
    if (diff < 100) {
      return o;
    }
    return `\u001b[90m${diff}ms\u001b[39m\n${o}`;
  },
});
replServer.context.pipeline = pipeline;
replServer.context.CountStream = CountStream;
replServer.context.crux = crux;
replServer.context.putTx = putTx;
replServer.context.deleteTx = deleteTx;
replServer.context.evictTx = evictTx;
replServer.context.toCruxDoc = toCruxDoc;
replServer.context.demo = demo;
const origEval = replServer.eval;
(replServer.eval as any) = function () {
  evalStartTime = Date.now();
  return origEval.apply(replServer, arguments);
};
