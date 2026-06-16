import type {
  ApplicationFields,
  PrefilledBeverageType,
  PrefilledFields,
} from "./types";

const BEVERAGE_TYPE_LABELS: Record<PrefilledBeverageType, string> = {
  spirits: "Distilled Spirits",
  wine: "Wine",
  beer: "Malt Beverage",
  unknown: "Unknown",
};

export function prefilledToApplicationFields(
  prefilled: PrefilledFields
): ApplicationFields {
  return {
    brandName: prefilled.brandName ?? "",
    classType: prefilled.classType ?? "",
    alcoholContent: prefilled.alcoholContent ?? "",
    netContents: prefilled.netContents ?? "",
    producerName: prefilled.producerName ?? "",
    beverageType: BEVERAGE_TYPE_LABELS[prefilled.beverageType],
  };
}
