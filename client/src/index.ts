import got from 'got';
import * as env from 'env-var';

import { keyword, EDNVal, EDNKeyword, tagValue } from './edn';
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
      [cruxIdKeyword, isUUID(id) ? tagValue('uuid', id) : keyword(id)],
      ...Object.entries(doc)
        .filter(([k, v]) => v !== undefined)
        .map(([k, v]) => [keyword(k), toEDNVal(v)] as [EDNKeyword, EDNVal]),
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

const run = async () => {
  try {
    const crux = setupCrux({
      prefixUrl: env
        .get('CRUX_URL')
        .default('http://localhost:3000')
        .asUrlString(),
    });
    console.log('read log');
    await crux.readTxLog();
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
      // await crux.awaitTx(lastTx);
    }
    if (lastTx) {
      console.log('awaiting tx', lastTx);
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
