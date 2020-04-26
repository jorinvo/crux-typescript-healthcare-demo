import * as faker from 'faker';

export const genCase = ({
  userIds,
  patientIds,
  departmentIds,
}: {
  userIds: string[];
  patientIds: string[];
  departmentIds: string[];
}) => {
  const caseId = faker.random.uuid();
  const createdByUser = faker.random.boolean();
  return {
    id: caseId,
    caseId,
    caseDepartmentId: faker.random.arrayElement(departmentIds),
    casePatientId: faker.random.arrayElement(patientIds),
    auditUserId: createdByUser ? faker.random.arrayElement(userIds) : undefined,
    auditIntegration: createdByUser ? undefined : 'hl7',
  };
};
