import { revisionFromEtag } from "./etag.js";

function preconditionError(detail: string): Error {
  const error = new Error(detail);
  Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 });
  return error;
}

export function assertIfMatch(ifMatch: string | undefined, currentRevision: number): void {
  if (!ifMatch) throw preconditionError("If-Match is required for this mutation");
  let expected: number;
  try {
    expected = revisionFromEtag(ifMatch);
  } catch {
    throw preconditionError("If-Match must contain a revision ETag");
  }
  if (expected !== currentRevision) throw preconditionError("The resource revision has changed");
}

export { preconditionError };
