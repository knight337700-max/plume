export function etagForRevision(revisionNo: number): string {
  if (!Number.isInteger(revisionNo) || revisionNo < 1)
    throw new Error("revisionNo must be a positive integer");
  return `W/\"revision-${revisionNo}\"`;
}

export function revisionFromEtag(etag: string): number {
  const match = /^W\/\"revision-(\d+)\"$/.exec(etag.trim());
  if (!match) throw new Error("Invalid revision ETag");
  return Number(match[1]);
}
