/** Accounting field alias dictionary (language-agnostic synonyms, not site names). */

/** @type {Record<string, string[]>} */
export const ACCOUNTING_FIELD_ALIASES = {
  document_no: [
    "document no",
    "document number",
    "invoice no",
    "invoice number",
    "inv no",
    "inv number",
    "doc ref",
    "doc no",
    "reference no",
    "ref no",
    "reference",
    "transaction no",
    "txn no",
    "voucher no",
  ],
  date: [
    "date",
    "posting date",
    "invoice date",
    "doc date",
    "document date",
    "transaction date",
    "txn date",
    "value date",
  ],
  supplier: [
    "supplier",
    "vendor",
    "company",
    "customer",
    "payee",
    "merchant",
    "party",
    "account name",
  ],
  description: [
    "description",
    "particulars",
    "narrative",
    "details",
    "memo",
    "remarks",
    "note",
  ],
  amount: [
    "amount",
    "net amount",
    "nett amount",
    "total amount",
    "value",
    "debit",
    "credit",
    "subtotal",
  ],
  tax: ["tax", "gst", "sst", "vat", "tax amount", "gst amount", "sst amount"],
  total: ["grand total", "total", "final total", "amount due", "net total"],
};

export const ACCOUNTING_SCHEMA_FIELDS = Object.keys(ACCOUNTING_FIELD_ALIASES);
