export const testkitPackageName = "@plume/testkit";

export function isPlumePackage(packageName = "") {
  return packageName.startsWith("@plume/");
}
