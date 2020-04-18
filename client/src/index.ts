import * as stream from 'stream';
import { promisify } from 'util';

import got from 'got';
import * as env from 'env-var';

import { toKeyword, EDNVal, EDNKeyword, tagValue } from './edn';
import { CruxMap, setupCrux, cruxIdKeyword } from './crux';
import {
  genUser,
  genPatient,
  genCase,
  genFormDefinition,
  genFormData,
  genPutTx,
} from './generate';
import { departmentTitles } from './hospitalData';

const pipeline = promisify(stream.pipeline);

type EDNCompatible =
  | string
  | number
  | Date
  | { [key: string]: EDNCompatible | undefined };
const toEDNVal = (value: EDNCompatible): EDNVal => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toEDNVal);
  }
  return { map: Object.entries(value).map(([k, v]) => [k, toEDNVal(v)]) };
};

const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
const isUUID = (s: string) => {
  return uuidRegex.test(s);
};

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
};

// Objects are converted to maps with keywords as keys
// `id` is used as Crux ID
// if `id` is a UUID string it is tagged as such, otherwise it is converted to a keyword
// `undefined` keys are removed from doc
const toCruxDoc = ({
  id,
  ...doc
}: {
  [key: string]: EDNCompatible | undefined;
  id?: string;
}): CruxMap => {
  return {
    map: [
      [cruxIdKeyword, isUUID(id) ? tagValue('uuid', id) : toKeyword(id)],
      ...Object.entries(doc)
        .filter(([k, v]) => v !== undefined)
        .map(([k, v]) => [toKeyword(k), toEDNVal(v)] as [EDNKeyword, EDNVal]),
    ],
  };
};

const genTransactions = () => {
  const numUsers = 5;
  const numPatients = 10;
  const numCases = 15;
  const numFormDefinitions = 10;
  const numFormsData = 60;

  const departmentIds = departmentTitles.map((title) =>
    title.toLowerCase().replace(' ', '_'),
  );
  const users: ReturnType<typeof genUser>[] = [];
  const userIds = [];
  for (let i = 0; i < numUsers; i++) {
    const user = genUser(userIds);
    users.push(user);
    userIds.push(user.id);
  }
  const patients: ReturnType<typeof genPatient>[] = [];
  for (let i = 0; i < numPatients; i++) {
    patients.push(genPatient(userIds));
  }
  const patientIds = patients.map(({ id }) => id);
  const cases: ReturnType<typeof genCase>[] = [];
  for (let i = 0; i < numCases; i++) {
    cases.push(genCase({ userIds, patientIds, departmentIds }));
  }
  // TODO: Fix types so this is compatible
  const formDefinitions = [];
  for (let i = 0; i < numFormDefinitions; i++) {
    formDefinitions.push(genFormDefinition());
  }
  const caseIds = cases.map(({ id }) => id);
  const formData: ReturnType<typeof genFormData>[] = [];
  for (let i = 0; i < numFormsData; i++) {
    formData.push(genFormData({ userIds, caseIds, formDefinitions }));
  }

  const transactions = [
    ...users,
    ...patients,
    ...cases,
    ...formDefinitions,
    ...formData,
  ].map((doc) => genPutTx(toCruxDoc(doc)));

  return transactions;
};

class CountStream extends stream.Writable {
  count = 0;
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
    // console.log('counting events in log');
    // const countStream = new CountTxStream();
    // await pipeline(await crux.readTxLog(), countStream);
    // console.log(countStream.count);
    console.log('patients');
    console.log(
      await crux.query({
        find: ['l', 'f'],
        where: [
          ['id', 'patientLastName', 'l'],
          ['id', 'patientFirstName', 'f'],
        ],
        // args: [ {
        // 	c: "Antonia"
        // },{c:'Justus'} ],
        limit: 10,
        orderBy: [{ asc: 'l' }, { desc: 'f' }],
        // fullResults: true,
      }),
      // .length
    );
    return;
    const numTransaction = env
      .get('NUM_TRANSACTIONS')
      .required()
      .asIntPositive();
    let lastTx;
    console.log('Waiting for DB to be reachable');
    while (!(await crux.status())) {
      await sleep(1000);
    }
    for (let i = 0; i < numTransaction; i++) {
      const transactions = genTransactions();
      console.log(`submitting batch ${i}`);
      const res = await crux.submit(transactions);
      lastTx = res.txId;
      console.log('awaiting tx', lastTx);
      await crux.awaitTx(lastTx);
    }
    if (lastTx) {
      await crux.awaitTx(lastTx);
    }
    console.log(await crux.attributeStats());
  } catch (error) {
    if (error instanceof got.HTTPError || error instanceof got.ParseError) {
      console.log(error.response.body);
    }

    console.log(error);
  }
};

run();
