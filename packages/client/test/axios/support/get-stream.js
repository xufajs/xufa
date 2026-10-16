// get-stream's functions that axios's tests use: a stream (Node's or async iterable) read whole.
async function getStreamAsBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const getStream = async (stream) => (await getStreamAsBuffer(stream)).toString('utf8');

export default getStream;
export { getStream, getStreamAsBuffer };
