import * as stream from 'stream';
import { promisify } from 'util';

import * as env from 'env-var';

import { setupCrux, cruxIdKeyword, putTx, CruxMap } from './crux';
import { toKeyword } from './crux/edn';

const pipeline = promisify(stream.pipeline);

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
};

const now = () => new Date();

// Follower guarantees at least once delivery.
// Keeps a cursor in the DB an in memory,
// then follows the tx log through polling.
// The in-memory cursor is update to the latest tx,
// but the on-disk cursor is only updated when a tx was relevant for the follower.
// This balances between processing each tx only once and keeping things performant.
//
// After finding a relevant operation the latest state of the entity is fetched.
// So if the tx was in the past, we process the latest state instead.
// The strategy might vary for each follower.
//
// TODO: consider writes in the future
const run = async () => {
  const crux = setupCrux({
    prefixUrl: env
      .get('CRUX_URL')
      .default('http://localhost:3000')
      .asUrlString(),
  });
  const followerCursorKey = 'follower/cursor';
  const followerCursorKeyword = toKeyword(followerCursorKey);
  const followerId = toKeyword('follower/patientCreate');
  let cursor = 0;
  const cursorQuery = (
    await crux.query({
      find: ['cursor'],
      where: [['followerId', 'follower/cursor', 'cursor']],
      args: [{ followerId }],
    })
  )[0];
  if (cursorQuery && cursorQuery.cursor) {
    cursor = cursorQuery.cursor;
  }
  console.log('following patient creates and updates');
  while (true) {
    try {
      await pipeline(
        await crux.readTxLog({ afterTxId: cursor }),
        new stream.Writable({
          objectMode: true,
          async write(tx, encoding, callback) {
            const txId = tx['crux.tx/tx-id'];
            await crux.awaitTx(txId);
            const events = tx['crux.tx.event/tx-events'].map(
              ([op, a, hash]) => {
                // TODO: a is the previous hash? mostly hash of an empty doc?
                return { op, hash };
              },
            );
            const documentsByHash = await crux.getDocuments(
              events.map((e) => e.hash),
            );
            const ops = events
              .map((event) => {
                return { ...event, document: documentsByHash[event.hash] };
              })
              .filter(({ op, document }) => {
                // if (validTime > now()) {
                //   console.log('Oh no! Cannot handle writes in the future');
                //   return false;
                // }
                return op === 'crux.tx/put' && document.patientId;
              });
            for (const { document } of ops) {
              const {
                patientFirstName,
                patientLastName,
              } = await crux.getEntity(document[cruxIdKeyword.key].val);
              console.log(`patient: ${patientFirstName} ${patientLastName}`);
            }
            cursor = txId;
            if (ops.length) {
              await crux.submit([
                putTx({
                  map: [
                    [cruxIdKeyword, followerId],
                    [followerCursorKeyword, cursor],
                  ],
                } as CruxMap),
              ]);
            }
            callback();
          },
        }),
      );
    } catch (e) {
      console.log('error:', e);
    }
    await sleep(1000);
  }
};

run();
