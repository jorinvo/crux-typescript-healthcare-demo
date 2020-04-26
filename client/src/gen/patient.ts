import * as faker from 'faker';

export const genPatient = (userIds: string[]) => {
  const patientId = faker.random.uuid();
  const patientFirstName = faker.name.firstName();
  const patientLastName = faker.name.lastName();
  const createdByUser = faker.random.boolean();
  return {
    id: patientId,
    patientId,
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
