import { ResponsibilityMode } from '../../common/enums';

export function billNotifyTargets(input: {
  mode: ResponsibilityMode;
  propertyRented: boolean;
  sharedParties?: string[];
}): string[] {
  if (input.mode === ResponsibilityMode.SHARED) {
    return [...new Set(input.sharedParties || [])];
  }
  if (input.mode === ResponsibilityMode.TENANT) {
    return input.propertyRented ? ['TENANT'] : ['OWNER', 'MANAGER'];
  }
  if (!input.propertyRented) return ['OWNER', 'MANAGER'];
  if (input.mode === ResponsibilityMode.OWNER) return ['OWNER', 'MANAGER'];
  if (input.mode === ResponsibilityMode.MANAGER) return ['MANAGER', 'OWNER'];
  return ['OWNER'];
}
