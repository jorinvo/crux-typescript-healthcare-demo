import * as env from 'env-var';
import * as faker from 'faker';

import { departmentTitles } from './hospitalData';
import { toKeyword, EDNVal, EDNKeyword, tagValue } from './edn';
import { setupCrux, CruxMap, putTx, cruxIdKeyword } from './crux';

export const genUser = (userIds: string[]) => {
  const userFirstName = faker.name.firstName();
  const userLastName = faker.name.lastName();
  const createdByUser = faker.random.boolean();
  return {
    type: 'user',
    id: faker.random.uuid(),
    userFirstName,
    userLastName,
    userUsername: faker.internet.userName(userFirstName, userLastName),
    userEmail: faker.random.boolean()
      ? faker.internet.email(userFirstName, userLastName)
      : undefined,
    auditUserId: createdByUser ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdByUser ? undefined : 'ldap',
  };
};

export const genPatient = (userIds: string[]) => {
  const patientFirstName = faker.name.firstName();
  const patientLastName = faker.name.lastName();
  const createdByUser = faker.random.boolean();
  return {
    type: 'patient',
    id: faker.random.uuid(),
    patientFirstName,
    patientLastName,
    patientBirthday: faker.date.past(100),
    patientEmail: faker.random.boolean()
      ? faker.internet.email(patientFirstName, patientLastName)
      : undefined,
    auditUserId: createdByUser ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdByUser ? undefined : 'hl7',
  };
};

export const genCase = ({
  userIds,
  patientIds,
  departmentIds,
}: {
  userIds: string[];
  patientIds: string[];
  departmentIds: string[];
}) => {
  const createdByUser = faker.random.boolean();
  return {
    type: 'case',
    id: faker.random.uuid(),
    caseDepartmentId: faker.random.arrayElement(departmentIds),
    casePatientId: faker.random.arrayElement(patientIds),
    auditUserId: createdByUser ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdByUser ? undefined : 'hl7',
  };
};

interface FormDefinition {
  type: 'formDefinition';
  id: string;
  formDefinitionTitle: string;
  formDefinitionFields: (
    | {
        id: string;
        formFieldLabel: string;
        formFieldType: 'number';
        formFieldOptions: { min: number; max: number };
      }
    | {
        id: string;
        formFieldLabel: string;
        formFieldType: 'text';
        formFieldOptions: {};
      }
  )[];
}

const formFieldTypes = {
  number: {
    generateOptions() {
      const min = faker.random.number({ min: -100, max: 100 });
      const range = faker.random.number({ min: 10, max: 100 });
      return { min, max: min + range };
    },
  },
  text: {
    generateOptions() {
      return {};
    },
  },
};

const generateFormFieldValue = (
  field:
    | {
        formFieldType: 'number';
        formFieldOptions: { min: number; max: number };
      }
    | {
        formFieldType: 'text';
        formFieldOptions: {};
      },
) => {
  if (field.formFieldType === 'number') {
    return faker.random.number(field.formFieldOptions);
  }
  if (field.formFieldType === 'text') {
    return faker.lorem.sentences(faker.random.number({ min: 0, max: 10 }));
  }
  throw new TypeError('Unknown form field type');
};

export const genFormDefinition = (): FormDefinition => {
  const numFields = faker.random.number({ min: 1, max: 100 });
  const formDefinitionFields = [];
  for (let i = 0; i < numFields; i++) {
    const formFieldType = faker.random.arrayElement(
      Object.keys(formFieldTypes),
    );
    formDefinitionFields.push({
      // TODO: The ids must be unique in a form
      id: faker.random.alphaNumeric(10),
      formFieldLabel: faker.lorem.sentence().replace(/\.$/, '?'),
      formFieldType,
      formFieldOptions: formFieldTypes[formFieldType].generateOptions(),
    });
  }

  return {
    type: 'formDefinition',
    id: faker.random.uuid(),
    formDefinitionTitle: faker.lorem
      .words(faker.random.number({ min: 2, max: 7 }))
      .replace(/^\w/, (c) => c.toUpperCase()),
    formDefinitionFields,
  };
};

export const genFormData = ({
  userIds,
  caseIds,
  formDefinitions,
}: {
  userIds: string[];
  caseIds: string[];
  formDefinitions: FormDefinition[];
}) => {
  const createdBy = faker.random.arrayElement([
    'user',
    'integration',
    'email',
    'tablet',
  ]);
  const formDefinition = faker.random.arrayElement(formDefinitions);
  return {
    type: 'formData',
    id: faker.random.uuid(),
    formDataCaseId: faker.random.arrayElement(caseIds),
    formDataDefinitionId: formDefinition.id,
    formDataFields: formDefinition.formDefinitionFields
      .map((field) => {
        return [field.id, generateFormFieldValue(field)];
      })
      .reduce((memo, [k, v]) => {
        return { ...memo, [k]: v };
      }, {} as Record<string, string | number>),
    auditUserId:
      createdBy === 'user' ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdBy === 'integration' ? 'hl7' : undefined,
    auditTabletId: createdBy === 'tablet' ? faker.internet.mac() : undefined,
  };
};

export const genFormDataUpdate = ({
  userIds,
  formData,
  formDefinitions,
}: {
  userIds: string[];
  formData: ReturnType<typeof genFormData>;
  formDefinitions: FormDefinition[];
}) => {
  const createdBy = faker.random.arrayElement([
    'user',
    'integration',
    'email',
    'tablet',
  ]);
  const formDefinition = formDefinitions.find(
    (def) => def.id === formData.formDataDefinitionId,
  );
  return {
    ...formData,
    formDataFields: formDefinition.formDefinitionFields
      .map((field) => {
        return [field.id, generateFormFieldValue(field)];
      })
      .reduce((memo, [k, v]) => {
        return { ...memo, [k]: v };
      }, {} as Record<string, string | number>),
    auditUserId:
      createdBy === 'user' ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdBy === 'integration' ? 'hl7' : undefined,
    auditTabletId: createdBy === 'tablet' ? faker.internet.mac() : undefined,
  };
};

export const genPutTx = (doc: CruxMap, validTime?: Date) => {
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
