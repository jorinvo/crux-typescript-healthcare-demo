// Things to do in REPL

await crux.status()

await crux.attributeStats()

await demo.countLogEvents()


 // First execute .editor in the REPL,
// then pase this multi-line command,
// then hit CTRL-D
//
await crux.query({
  find: ['f', 'c', 'p', 'd', 'u'],
  where: [
    ['c', 'casePatientId', 'p'],
    ['f', 'formDataCaseId', 'c'],
    ['f', 'auditUserId', 'u'],
    ['f', 'formDataDefinitionId', 'd']
  ],
  limit: 1,
  fullResults: true
})

// Calculate aggregates directly in the database
await crux.query({
  find: [
    ['patientCount', 'count', 'id'],
    ['distinctLastNames', 'count-distinct', 'lastName'],
  ],
  where: [
    ['id', 'patientLastName', 'lastName'],
  ],
})

// Aggregates are automatically grouped across the selected fields
await crux.query({
  find: [
    'definitionTitle',
    ['definitionCount', 'count', 'def'],
  ],
  where: [
    ['data', 'formDataDefinitionId', 'def'],
    ['def', 'formDefinitionTitle', 'definitionTitle']
  ],
})


// Write a document
doc = toCruxDoc({ id: 'mycounter', counterValue: 0 })
tx = putTx(doc)
await crux.submit([tx])

// Read
await crux.getEntity('mycounter')

// Update
await crux.submit([putTx(toCruxDoc({ id: 'mycounter', counterValue: 1 }))])

// Read history
await crux.getEntityHistory('mycounter', { withDocuments: true })

// Read in past
{ validTime } = (await crux.getEntityHistory('mycounter'))[1]
await crux.getEntity('mycounter', { validTime })

// Write in past
await crux.submit([putTx(toCruxDoc({ id: 'mycounter', counterValue: 2 }), validTime)])
await crux.getEntity('mycounter', { validTime })

// Delete
await crux.submit([ deleteTx('mycounter') ])
await crux.getEntity('mycounter')
await crux.getEntity('mycounter', { validTime })
await crux.getEntityHistory('mycounter', { withDocuments: true })

// Evict
await crux.submit([ evictTx('mycounter') ])
await crux.getEntityHistory('mycounter', { withDocuments: true })

















class LimitedStream extends stream.Transform {
  count = 0;
  _transform(chunk, encoding, callback) {
    if (this.count < 1) {
      this.push(null);
    } else {
      this.push(chunk);
    }
    this.count--;
    callback();
  }
}
const limitObjectStream = (count: number) => {
  const s = new LimitedStream({
    objectMode: true,
  });
  s.count = count;
  return s;
};

