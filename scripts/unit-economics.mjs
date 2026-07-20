export const UNIT_ECONOMICS_COST_FIELDS = [
  "blankCaseCents",
  "printingSuppliesCents",
  "productionLaborCents",
  "qualityControlCents",
  "packagingCents",
  "outboundShippingCents",
  "remakeRefundReserveCents",
  "vendorMachineCents",
];

const isNonNegativeInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0;

const readInteger = (value, path, errors, { min = 0, max = 10000 } = {}) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${path} must be an integer from ${min} to ${max}.`);
    return null;
  }
  return value;
};

export function validateUnitEconomicsEvidence(input) {
  const errors = [];
  const summaries = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Evidence must be a JSON object."], summaries };
  }

  if (input.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!["synthetic_example", "physical_pilot"].includes(input.evidenceType)) {
    errors.push("evidenceType must be synthetic_example or physical_pilot.");
  }

  const targetMarginBps = readInteger(
    input.marginPolicy?.targetContributionMarginBps,
    "marginPolicy.targetContributionMarginBps",
    errors,
  );
  const reviewFloorBps = readInteger(
    input.marginPolicy?.reviewFloorContributionMarginBps,
    "marginPolicy.reviewFloorContributionMarginBps",
    errors,
  );
  if (
    targetMarginBps !== null &&
    reviewFloorBps !== null &&
    reviewFloorBps > targetMarginBps
  ) {
    errors.push("The review floor cannot exceed the target contribution margin.");
  }

  const paymentRateBps = readInteger(
    input.paymentProcessing?.rateBps,
    "paymentProcessing.rateBps",
    errors,
  );
  const paymentFixedCents = readInteger(
    input.paymentProcessing?.fixedCents,
    "paymentProcessing.fixedCents",
    errors,
    { max: 100000 },
  );

  if (!Array.isArray(input.products) || input.products.length === 0) {
    errors.push("products must contain at least one pricing scenario.");
  } else {
    const seenIds = new Set();
    for (const [index, product] of input.products.entries()) {
      const basePath = `products[${index}]`;
      if (!product || typeof product !== "object" || Array.isArray(product)) {
        errors.push(`${basePath} must be an object.`);
        continue;
      }
      if (typeof product.id !== "string" || !product.id.trim()) {
        errors.push(`${basePath}.id must be a non-empty string.`);
      } else if (seenIds.has(product.id)) {
        errors.push(`${basePath}.id must be unique.`);
      } else {
        seenIds.add(product.id);
      }

      const productPriceCents = readInteger(
        product.productPriceCents,
        `${basePath}.productPriceCents`,
        errors,
        { min: 1, max: 10000000 },
      );
      const customerShippingCents = readInteger(
        product.customerShippingCents,
        `${basePath}.customerShippingCents`,
        errors,
        { max: 10000000 },
      );

      let operatingCostCents = 0;
      for (const field of UNIT_ECONOMICS_COST_FIELDS) {
        const value = product.costs?.[field];
        if (!isNonNegativeInteger(value)) {
          errors.push(`${basePath}.costs.${field} must be a non-negative integer.`);
        } else {
          operatingCostCents += value;
        }
      }

      if (
        productPriceCents === null ||
        customerShippingCents === null ||
        paymentRateBps === null ||
        paymentFixedCents === null
      ) {
        continue;
      }

      const revenueCents = productPriceCents + customerShippingCents;
      const paymentFeeCents =
        Math.round((revenueCents * paymentRateBps) / 10000) +
        paymentFixedCents;
      const totalVariableCostCents = operatingCostCents + paymentFeeCents;
      const contributionCents = revenueCents - totalVariableCostCents;
      const contributionMarginBps = Math.round(
        (contributionCents / revenueCents) * 10000,
      );
      const calculated = {
        revenueCents,
        paymentFeeCents,
        operatingCostCents,
        totalVariableCostCents,
        contributionCents,
        contributionMarginBps,
      };

      for (const [field, value] of Object.entries(calculated)) {
        if (product.claimed?.[field] !== value) {
          errors.push(
            `${basePath}.claimed.${field} must equal calculated value ${value}.`,
          );
        }
      }
      if (
        reviewFloorBps !== null &&
        contributionMarginBps < reviewFloorBps
      ) {
        errors.push(
          `${basePath} contribution margin ${contributionMarginBps} bps is below the ${reviewFloorBps} bps review floor.`,
        );
      }
      summaries.push({ id: product.id, ...calculated });
    }
  }

  const decisionType = input.decision?.type;
  const approvalStatus = input.approval?.status;
  if (!["analysis_only", "launch_approved"].includes(decisionType)) {
    errors.push("decision.type must be analysis_only or launch_approved.");
  }
  if (!["not_approved", "approved"].includes(approvalStatus)) {
    errors.push("approval.status must be not_approved or approved.");
  }
  if (decisionType === "analysis_only" && approvalStatus !== "not_approved") {
    errors.push("Analysis-only evidence cannot be marked approved.");
  }
  if (decisionType === "launch_approved") {
    if (input.evidenceType !== "physical_pilot") {
      errors.push("Launch approval requires physical_pilot evidence.");
    }
    if (approvalStatus !== "approved") {
      errors.push("A launch-approved decision requires approval.status=approved.");
    }
    if (
      typeof input.approval?.approvedByRole !== "string" ||
      !input.approval.approvedByRole.trim() ||
      typeof input.approval?.approvedAt !== "string" ||
      Number.isNaN(Date.parse(input.approval.approvedAt))
    ) {
      errors.push("Launch approval requires approvedByRole and a valid approvedAt date.");
    }
    if (
      targetMarginBps !== null &&
      summaries.some(
        (summary) => summary.contributionMarginBps < targetMarginBps,
      )
    ) {
      errors.push("Every launch-approved product must meet the target contribution margin.");
    }
  }

  return { ok: errors.length === 0, errors, summaries };
}
