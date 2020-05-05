import got, { GotError, HTTPError } from 'got';

import {
  EDNVal,
  EDNKeyword,
  EDNTaggedVal,
  toEDNString,
  parseEDNString,
  parseEDNListStream,
  toKeyword,
  toSymbol,
  tagValue,
} from './edn';

export type CruxMap = { map: [EDNKeyword, EDNVal][] };
interface QueryOptions {
  find: string[];
  where: [string, string, string][];
  args?: { [arg: string]: EDNVal }[];
  // rules?: string;
  offset?: number;
  limit?: number;
  orderBy?: (
    | { asc: string; desc?: undefined }
    | { desc: string; asc?: undefined }
  )[];
  timeout?: number;
  fullResults?: boolean;
}

export const cruxIdKeyword = toKeyword('crux.db/id');
const cruxPutKeyword = toKeyword('crux.tx/put');
const cruxDeleteKeyword = toKeyword('crux.tx/delete');
const cruxEvictKeyword = toKeyword('crux.tx/evict');

const ednMapWithKeywordsToObject = (m: {
  map: [EDNKeyword, EDNVal][];
}): Record<string, EDNVal> => {
  return m.map.reduce((memo, [k, v]) => {
    return { ...memo, [k.key]: v };
  }, {});
};

const toKeywordMap = (obj: Record<string, EDNVal>): CruxMap => {
  return {
    map: Object.entries(obj)
      .filter(([k, v]) => {
        return v !== undefined;
      })
      .map(([k, v]) => {
        return [toKeyword(k), v];
      }),
  };
};

const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
const isUUID = (s: string) => {
  return uuidRegex.test(s);
};

const toCruxId = (id: string) => {
  return isUUID(id) ? tagValue('uuid', id) : toKeyword(id);
};

const buildQuery = ({
  find,
  where,
  args,
  // TODO: rules,
  offset,
  limit,
  orderBy,
  timeout,
  fullResults,
}: QueryOptions) => {
  return toKeywordMap({
    // TODO: validate that find symbols are in where and _ is not allowed
    find: find.map(toSymbol),
    where: where.map(([e, a, v]) => {
      return [toSymbol(e), toKeyword(a), toSymbol(v)];
    }),
    // TODO: validate that 3rd elem in where is in args
    args:
      args &&
      args.map((arg) => {
        return {
          map: Object.entries(arg).map(([k, v]) => {
            return [toSymbol(k), v];
          }),
        };
      }),
    // rules,
    offset,
    limit,
    'order-by':
      //TODO: assert in find clause
      orderBy &&
      orderBy.map((order) => {
        if (order.asc !== undefined) {
          return [toSymbol(order.asc), toKeyword('asc')];
        }
        return [toSymbol(order.desc), toKeyword('desc')];
      }),
    timeout,
    'full-results?': fullResults,
  });
};

export const setupCrux = ({ prefixUrl }: { prefixUrl: string }) => {
  const httpClient = got.extend({ prefixUrl });

  async function getDocuments(contentHashes: string[]) {
    const response = await httpClient.post('documents', {
      headers: { 'Content-Type': 'application/edn' },
      body: toEDNString({ set: contentHashes }),
    });
    const parsed = parseEDNString(response.body, {
      keywordAs: 'string',
      mapAs: 'object',
    }) as any;
    return parsed;
  }

  return {
    async status() {
      try {
        const response = await httpClient.get({
          headers: { 'Content-Type': 'application/edn' },
        });
        const parsed = parseEDNString(response.body, {
          keywordAs: 'string',
          mapAs: 'object',
        });
        return parsed;
      } catch (e) {
        if (e instanceof GotError && e.code === 'ECONNREFUSED') {
          return undefined;
        }
        throw e;
      }
    },

    async submit(
      transactions: Array<
        | [EDNKeyword, { map: [EDNKeyword, EDNVal][] }]
        | [EDNKeyword, { map: [EDNKeyword, EDNVal][] }, Date]
      >,
    ) {
      const response = await httpClient.post('tx-log', {
        headers: { 'Content-Type': 'application/edn' },
        body: toEDNString(transactions),
      });
      const parsed = parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      });
      return {
        txId: parsed['crux.tx/tx-id'],
        txTime: parsed['crux.tx/tx-time'],
      };
    },

    async getEntity(
      entityId: string,
      {
        validTime,
        transactionTime,
      }: { validTime?: Date; transactionTime?: Date } = {},
    ) {
      try {
        const response = await httpClient.post('entity', {
          headers: { 'Content-Type': 'application/edn' },
          body: toEDNString(
            toKeywordMap({
              eid: toCruxId(entityId),
              'valid-time': validTime,
              'transaction-time': transactionTime,
            }),
          ),
        });
        const parsed = parseEDNString(response.body, {
          keywordAs: 'string',
          mapAs: 'object',
        }) as any;
        return parsed;
      } catch (error) {
        if (error instanceof HTTPError && error.response.statusCode) {
          return undefined;
        }
        throw error;
      }
    },

    async getEntityHistory(entityId: string, { withDocuments = false } = {}) {
      const response = await httpClient.get(
        `history/${isUUID(entityId) ? entityId : `:${entityId}`}`,
        {
          headers: { 'Content-Type': 'application/edn' },
        },
      );
      const parsed = parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      }) as any;
      const history = parsed.map((item) => {
        return {
          contentHash: item['crux.db/content-hash'],
          validTime: item['crux.db/valid-time'],
          transactionTime: item['crux.tx/tx-time'],
          transactionId: item['crux.tx/tx-id'],
        };
      });
      if (!withDocuments) {
        return history;
      }
      const documents = await getDocuments(
        history.map(({ contentHash }) => contentHash),
      );
      return history.map((item) => {
        return {
          ...item,
          document: documents[item.contentHash],
        };
      });
    },

    getDocuments,

    async query(
      queryOptions: QueryOptions,
      { validTime }: { validTime?: Date } = {},
    ) {
      // TODO support predicates
      const query = buildQuery(queryOptions);
      const response = await httpClient.post('query', {
        headers: { 'Content-Type': 'application/edn' },
        body: toEDNString(
          toKeywordMap({
            query,
            'valid-time': validTime,
          }),
        ),
      });
      const parsed = parseEDNString(response.body) as any;
      const rows = queryOptions.orderBy ? parsed : parsed.set;
      if (queryOptions.fullResults) {
        return rows.map((row) => {
          return row.map((field) => {
            if (field && field.map) {
              return ednMapWithKeywordsToObject(field);
            }
            return field;
          });
        });
      }
      return rows.map((row) => {
        return queryOptions.find.reduce((memo, field, i) => {
          return { ...memo, [field]: row[i] };
        }, {});
      });
    },

    async queryStream(
      queryOptions: QueryOptions,
      { validTime }: { validTime?: Date } = {},
    ) {
      // TODO support predicates
      const query = buildQuery(queryOptions);
      const response = await httpClient.stream.post('query-stream', {
        headers: { 'Content-Type': 'application/edn' },
        body: toEDNString(
          toKeywordMap({
            query,
            'valid-time': validTime,
          }),
        ),
      });
      return response.pipe(parseEDNListStream());
    },

    async readTxLog({ withOps = false, afterTxId = 0 } = {}) {
      const response = await httpClient.stream('tx-log', {
        headers: { 'Content-Type': 'application/edn' },
        searchParams: {
          'with-ops': withOps,
          'after-tx-id': afterTxId,
        },
      });
      return response.pipe(
        parseEDNListStream({
          keywordAs: 'string',
          mapAs: 'object',
          listAs: 'array',
        }),
      );
    },

    async awaitTx(txId: number) {
      const response = await httpClient.get('await-tx', {
        headers: { 'Content-Type': 'application/edn' },
        searchParams: { 'tx-id': txId },
      });
      const parsed = parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      });
      return {
        txId: parsed['crux.tx/tx-id'],
        txTime: parsed['crux.tx/tx-time'],
      };
    },

    async attributeStats() {
      const response = await httpClient.get('attribute-stats', {
        headers: { 'Content-Type': 'application/edn' },
      });
      return parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      });
    },
  };
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
export const toCruxDoc = ({
  id,
  ...doc
}: {
  [key: string]: EDNCompatible | undefined;
  id?: string;
}): CruxMap => {
  return {
    map: [
      [cruxIdKeyword, toCruxId(id)],
      ...Object.entries(doc)
        .filter(([k, v]) => v !== undefined)
        .map(([k, v]) => [toKeyword(k), toEDNVal(v)] as [EDNKeyword, EDNVal]),
    ],
  };
};

export const putTx = (
  doc: CruxMap,
  validTime?: Date,
): [EDNKeyword, CruxMap] | [EDNKeyword, CruxMap, Date] => {
  if (validTime === undefined) {
    return [cruxPutKeyword, doc];
  }
  return [cruxPutKeyword, doc, validTime];
};

export const deleteTx = (
  entityId: string,
  validTime?: Date,
):
  | [EDNKeyword, EDNKeyword | EDNTaggedVal]
  | [EDNKeyword, EDNKeyword | EDNTaggedVal, Date] => {
  if (validTime === undefined) {
    return [cruxDeleteKeyword, toCruxId(entityId)];
  }
  return [cruxDeleteKeyword, toCruxId(entityId), validTime];
};

export const evictTx = (
  entityId: string,
): [EDNKeyword, EDNKeyword | EDNTaggedVal] => {
  return [cruxEvictKeyword, toCruxId(entityId)];
};
