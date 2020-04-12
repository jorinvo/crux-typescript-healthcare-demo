import * as faker from 'faker';
import { CruxMap, putTx } from './crux';

export const genUser = (userIds: string[]) => {
  const userFirstName = faker.name.firstName();
  const userLastName = faker.name.lastName();
  const createdByUser = faker.random.boolean();
  return {
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
    id: faker.random.uuid(),
    caseDepartmentId: faker.random.arrayElement(departmentIds),
    casePatientId: faker.random.arrayElement(patientIds),
    auditUserId: createdByUser ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdByUser ? undefined : 'hl7',
  };
};

interface IFormDefinition {
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

export const genFormDefinition = (): IFormDefinition => {
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
    // TODO gen id from title and check for conflicts with existing forms
    id: faker.random.alphaNumeric(10),
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
  formDefinitions: IFormDefinition[];
}) => {
  const createdBy = faker.random.arrayElement([
    'user',
    'integration',
    'email',
    'tablet',
  ]);
  const formDefinition = faker.random.arrayElement(formDefinitions);
  return {
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
  formDefinitions: IFormDefinition[];
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

export const genPutTx = (
  doc: CruxMap,
  validTime?: Date,
) => {
  if (faker.random.boolean()) {
    return putTx(doc);
  }
  return putTx(doc, faker.date.recent(180));
};
