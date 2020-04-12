import * as edn from 'jsedn';
import got from 'got';

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
  return new Map(Object.entries(value).map(([k, v]) => [k, toEDNVal(v)]));
};

const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
const isUUID = (s: string) => {
  return uuidRegex.test(s);
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
  return new Map([
    [cruxIdKeyword, isUUID(id) ? tagValue('uuid', id) : keyword(id)],
    ...Object.entries(doc)
      .filter(([k, v]) => v !== undefined)
      .map(([k, v]) => [keyword(k), toEDNVal(v)] as [EDNKeyword, EDNVal]),
  ]);
};

const genTransactions = () => {
  const numUsers = 5;
  const numPatients = 10;
  const numCases = 15;
  const numFormDefinitions = 10;
  const numFormsData = 40;

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
    const crux = setupCrux({ prefixUrl: 'http://crux:3000/' });
    // const crux = setupCrux({ prefixUrl: 'http://localhost:3000/' });
    const numTransaction = 0;
    // const numTransaction = 1000;
    for (let i = 0; i < numTransaction; i++) {
      const transactions = genTransactions();
      // console.log(JSON.stringify(transactions, null, 2));
      // console.log(transactions);
      console.log('submitting batch')
      await crux.submit(transactions);
      console.log('done')
      // const response = await crux.submit(transactions);
      // console.log(response);
    }
		console.log(await crux.attributeStats())
  } catch (error) {
    if (error instanceof got.HTTPError || error instanceof got.ParseError) {
      console.log(edn.parse(error.response.body));
    }

    console.log(error);
  }
};

run();
