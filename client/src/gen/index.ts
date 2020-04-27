import * as env from 'env-var';

import { genTransactions } from './transaction';

import { setupCrux } from '../crux';

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
};

const run = async () => {
  const numTransactions = env.get('NUM_TX').required().asIntPositive();
  const awaitEveryTransaction = env.get('AWAIT_EVERY_TX').asBool();
  const sleepBetweenTransactions = env.get('SLEEP').default(0).asIntPositive();
  const crux = setupCrux({
    prefixUrl: env
      .get('CRUX_URL')
      .default('http://localhost:3000')
      .asUrlString(),
  });
  let lastTx;
  console.log('Waiting for DB to be reachable');
  while (!(await crux.status())) {
    await sleep(1000);
  }
  for (let i = 0; i < numTransactions; i++) {
    const transactions = genTransactions();
    console.log(`batch ${i}`);
    const res = await crux.submit(transactions);
    lastTx = res.txId;
    if (awaitEveryTransaction) {
      await crux.awaitTx(lastTx);
    }
    await sleep(sleepBetweenTransactions);
  }
  if (lastTx) {
    console.log('awaiting last tx', lastTx);
    await crux.awaitTx(lastTx);
  }
};

run();
