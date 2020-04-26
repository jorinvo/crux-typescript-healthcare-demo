import * as faker from 'faker';

interface FormDefinition {
  id: string;
  formDefinitionId: string;
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

  const formDefinitionId = faker.random.uuid();
  return {
    id: formDefinitionId,
    formDefinitionId,
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
  const formDataId = faker.random.uuid();
  const createdBy = faker.random.arrayElement([
    'user',
    'integration',
    'email',
    'tablet',
  ]);
  const formDefinition = faker.random.arrayElement(formDefinitions);
  return {
    id: formDataId,
    formDataId,
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
