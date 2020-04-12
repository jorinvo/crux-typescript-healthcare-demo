import got from 'got';
import * as edn from 'jsedn';

import { EDNVal, EDNKeyword, toEDNString, keyword } from './edn';

export type CruxMap = Map<EDNKeyword, EDNVal>;

export const cruxIdKeyword = keyword('crux.db/id');
const cruxPutKeyword = keyword('crux.tx/put');

export const setupCrux = ({ prefixUrl }: { prefixUrl: string }) => {
  const httpClient = got.extend({ prefixUrl });
  return {
    async submit(
      transactions: Array<
        | [EDNKeyword, Map<EDNKeyword, EDNVal>]
        | [EDNKeyword, Map<EDNKeyword, EDNVal>, Date]
      >,
    ) {
      const response = await httpClient.post('tx-log', {
        headers: { 'Content-Type': 'application/edn' },
        body: toEDNString(transactions),
      });
      return edn.parse(response.body);
    },

		async attributeStats() {
      const response = await httpClient.get('attribute-stats', {
        headers: { 'Content-Type': 'application/edn' },
      });
      return edn.parse(response.body);
		}
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
