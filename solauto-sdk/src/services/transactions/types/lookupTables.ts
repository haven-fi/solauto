import { AddressLookupTableInput, Umi } from "@metaplex-foundation/umi";
import { getAddressLookupInputs } from "../../../utils";

export class LookupTables {
  cache: AddressLookupTableInput[] = [];

  constructor(
    public defaultLuts: string[],
    private umi: Umi
  ) {}

  async getLutInputs(
    additionalAddresses?: string[]
  ): Promise<AddressLookupTableInput[]> {
    const addresses = [...this.defaultLuts, ...(additionalAddresses ?? [])];
    const currentCacheAddresses = this.cache.map((x) => x.publicKey.toString());

    const missingAddresses = addresses.filter(
      (x) => !currentCacheAddresses.includes(x)
    );
    if (missingAddresses) {
      const additionalInputs = await getAddressLookupInputs(
        this.umi,
        missingAddresses
      );
      this.cache.push(...additionalInputs);
    }

    return this.cache;
  }

  reset() {
    this.cache = this.cache.filter((x) =>
      this.defaultLuts.includes(x.publicKey.toString())
    );
  }
}
