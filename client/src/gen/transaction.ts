import * as faker from 'faker';

import { toKeyword, EDNVal, EDNKeyword, tagValue } from '../crux/edn';
import { CruxMap, putTx, cruxIdKeyword } from '../crux';

import { departmentTitles } from './hospitalData';
import { genUser } from './user';
import { genPatient } from './patient';
import { genCase } from './case';
import { genFormDefinition, genFormData } from './formData';

const genPutTx = (doc: CruxMap, validTime?: Date) => {
  if (faker.random.boolean()) {
    return putTx(doc);
  }
  return putTx(doc, faker.date.recent(180));
};

const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
const isUUID = (s: string) => {
  return uuidRegex.test(s);
};

type EDNCompatible =
  | string
  | number
  | Date
  | { [key: string]: EDNCompatible | undefined };
const toEDNVal = (value: EDNCompatible): EDNVal => {
  if (typeof value === 'string') {
    if (isUUID(value)) {
      return tagValue('uuid', value);
    }
    return value;
  }
  if (typeof value === 'number' || value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toEDNVal);
  }
  return { map: Object.entries(value).map(([k, v]) => [k, toEDNVal(v)]) };
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

export const genTransactions = () => {
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
