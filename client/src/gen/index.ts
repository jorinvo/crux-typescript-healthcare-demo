import * as env from 'env-var';

import { genTransactions } from './transaction';

import { setupCrux } from '../crux';

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
};

const run = async () => {
  const numTransaction = env.get('NUM_TRANSACTIONS').required().asIntPositive();
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
  for (let i = 0; i < numTransaction; i++) {
    const transactions = genTransactions();
    console.log(`batch ${i}`);
    const res = await crux.submit(transactions);
    lastTx = res.txId;
    await crux.awaitTx(lastTx);
  }
  if (lastTx) {
    console.log('awaiting last tx', lastTx);
    await crux.awaitTx(lastTx);
  }
};

run();
