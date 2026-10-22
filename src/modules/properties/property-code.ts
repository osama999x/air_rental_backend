import { PropertyType } from '../../common/enums';

export function formatVisibleCode(type: PropertyType, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('INVALID_PROPERTY_SEQUENCE');
  }
  return `${type}-${sequence}`;
}

export interface SequenceStore {
  lock(type: PropertyType): Promise<number>;
  save(type: PropertyType, lastNumber: number): Promise<void>;
}

export async function allocatePropertyCode(
  store: SequenceStore,
  type: PropertyType,
): Promise<string> {
  const lastNumber = await store.lock(type);
  const next = lastNumber + 1;
  await store.save(type, next);
  return formatVisibleCode(type, next);
}
