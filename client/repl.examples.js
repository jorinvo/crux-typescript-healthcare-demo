// Things to do in REPL

 await crux.status()

 await crux.attributeStats()

 await demo.countLogEvents()


 // paste in .editor

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


 // Use programatically

 echo 'await crux.attributeStats()' | npm run -s repl | tail -n +1




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

