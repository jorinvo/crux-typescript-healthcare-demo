import * as faker from 'faker';

export const genUser = (userIds: string[]) => {
  const userId = faker.random.uuid();
  const userFirstName = faker.name.firstName();
  const userLastName = faker.name.lastName();
  const createdByUser = faker.random.boolean();
  return {
    id: userId,
    userId,
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
