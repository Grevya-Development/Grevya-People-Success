/**
 * Letter catalogue + HTML templates. Pure functions (safe on client and server).
 * Placeholders look like {{employee_name}}; every value is HTML-escaped when filled.
 */

export const LETTER_TYPES = [
  "offer",
  "appointment",
  "confirmation",
  "experience",
  "relieving",
  "address_proof",
  "employment_verification",
  "salary_certificate",
  "increment",
  "bonus",
  "promotion",
  "other",
] as const;

export type LetterType = (typeof LETTER_TYPES)[number];
export type LetterCategory = "general" | "salary";

export const LETTER_LABELS: Record<LetterType, string> = {
  offer: "Offer Letter",
  appointment: "Appointment Letter",
  confirmation: "Confirmation Letter",
  experience: "Experience Letter",
  relieving: "Relieving Letter",
  address_proof: "Address Proof Letter",
  employment_verification: "Employment Verification Letter",
  salary_certificate: "Salary Certificate",
  increment: "Increment Letter",
  bonus: "Bonus Letter",
  promotion: "Promotion Letter",
  other: "Other Letter",
};

const SALARY_TYPES: LetterType[] = ["salary_certificate", "increment", "bonus"];

export function letterCategory(type: LetterType): LetterCategory {
  return SALARY_TYPES.includes(type) ? "salary" : "general";
}

export function isLetterType(v: unknown): v is LetterType {
  return typeof v === "string" && (LETTER_TYPES as readonly string[]).includes(v);
}

/** Letters an employee may request themselves, per page. */
export const REQUESTABLE: Record<LetterCategory, LetterType[]> = {
  general: ["employment_verification", "address_proof", "experience", "relieving", "other"],
  salary: ["salary_certificate"],
};

export function letterTypeLabel(type: string | null | undefined) {
  if (!type) return "Letter";
  return isLetterType(type) ? LETTER_LABELS[type] : type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extra inputs HR provides for some letter types (beyond employee data). */
export type ExtraField = { key: string; label: string; type: "date" | "number" | "text"; required?: boolean; hint?: string };

export const EXTRA_FIELDS: Partial<Record<LetterType, ExtraField[]>> = {
  offer: [
    { key: "offer_ctc", label: "Offered annual CTC (₹)", type: "number", hint: "Defaults to the current salary structure" },
    { key: "acceptance_by", label: "Accept offer by", type: "date" },
  ],
  appointment: [{ key: "probation_months", label: "Probation (months)", type: "number", hint: "Default 6" }],
  confirmation: [{ key: "effective_date", label: "Confirmation effective from", type: "date", required: true }],
  experience: [{ key: "last_working_day", label: "Last working day", type: "date", required: true }],
  relieving: [
    { key: "last_working_day", label: "Last working day", type: "date", required: true },
    { key: "resignation_date", label: "Resignation submitted on", type: "date" },
  ],
  increment: [
    { key: "new_ctc", label: "Revised annual CTC (₹)", type: "number", required: true },
    { key: "effective_date", label: "Effective from", type: "date", required: true },
  ],
  bonus: [
    { key: "bonus_amount", label: "Bonus amount (₹)", type: "number", required: true },
    { key: "bonus_reason", label: "Bonus for", type: "text", hint: "e.g. FY 2025-26 performance" },
    { key: "payout_date", label: "Payout date", type: "date" },
  ],
  promotion: [
    { key: "new_designation", label: "New designation", type: "text", required: true },
    { key: "effective_date", label: "Effective from", type: "date", required: true },
    { key: "new_ctc", label: "Revised annual CTC (₹)", type: "number", hint: "Optional" },
  ],
  other: [{ key: "subject", label: "Subject", type: "text", required: true }],
};

/** Everything a template can reference. All values are plain strings. */
export type LetterData = Record<string, string>;

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fillTemplate(template: string, data: LetterData) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, key: string) => escapeHtml(data[key] ?? "—"));
}

const SIGN_OFF = `
<p>&nbsp;</p>
<p>For <strong>{{company}}</strong>,</p>
<p>&nbsp;</p>
<p><strong>{{signatory_name}}</strong><br/>{{signatory_title}}</p>`;

const HEAD = `<p><strong>Date:</strong> {{issue_date}}</p>`;

const TO_EMPLOYEE = `
<p>To,<br/><strong>{{salutation}} {{employee_name}}</strong><br/>Employee Code: {{employee_code}}<br/>{{designation}}, {{department}}<br/>{{location}}</p>`;

const TEMPLATES: Record<LetterType, { title: string; body: string }> = {
  offer: {
    title: "Offer of Employment",
    body: `${HEAD}
<p>Dear {{first_name}},</p>
<h2>Offer of Employment</h2>
<p>We are pleased to offer you the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at {{company}}, based at our {{location}} office. Your expected date of joining is <strong>{{date_of_joining}}</strong>.</p>
<p>Your total annual cost to company (CTC) will be <strong>{{offer_ctc}}</strong>. A detailed break-up of your compensation will be shared in your appointment letter.</p>
<p>This offer is subject to satisfactory verification of your documents and background. Please confirm your acceptance by signing and returning a copy of this letter by <strong>{{acceptance_by}}</strong>.</p>
<p>We look forward to welcoming you to the {{company}} family.</p>
${SIGN_OFF}`,
  },
  appointment: {
    title: "Letter of Appointment",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>Letter of Appointment</h2>
<p>Dear {{first_name}},</p>
<p>With reference to your application and subsequent discussions, we are pleased to appoint you as <strong>{{designation}}</strong> in the {{department}} department with effect from <strong>{{date_of_joining}}</strong>, on the following terms and conditions:</p>
<ol>
<li><strong>Place of work:</strong> You will be based at our {{location}} office. The company may transfer you to any of its offices as business requires.</li>
<li><strong>Employment type:</strong> {{employment_type}}.</li>
<li><strong>Probation:</strong> You will be on probation for {{probation_months}} months from your date of joining, after which your services will be confirmed in writing subject to satisfactory performance.</li>
<li><strong>Compensation:</strong> Your annual CTC will be {{annual_ctc}}, as per the break-up below.</li>
<li><strong>Reporting:</strong> You will report to {{manager_name}}.</li>
<li><strong>Notice period:</strong> Either party may terminate this employment by giving notice as per company policy.</li>
</ol>
<table>
<tr><th>Component</th><th>Annual (₹)</th></tr>
<tr><td>Basic</td><td>{{basic}}</td></tr>
<tr><td>House Rent Allowance</td><td>{{hra}}</td></tr>
<tr><td>Special Allowance</td><td>{{special_allowance}}</td></tr>
<tr><td><strong>Total CTC</strong></td><td><strong>{{annual_ctc}}</strong></td></tr>
</table>
<p>You will be governed by the policies of {{company}} as amended from time to time. Please sign a copy of this letter as a token of your acceptance.</p>
${SIGN_OFF}`,
  },
  confirmation: {
    title: "Confirmation of Employment",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>Confirmation of Employment</h2>
<p>Dear {{first_name}},</p>
<p>We are pleased to inform you that, on successful completion of your probation period, your services with {{company}} as <strong>{{designation}}</strong> are confirmed with effect from <strong>{{effective_date}}</strong>.</p>
<p>All other terms and conditions of your appointment remain unchanged. We appreciate your contribution and look forward to your continued growth with us.</p>
${SIGN_OFF}`,
  },
  experience: {
    title: "Experience Certificate",
    body: `${HEAD}
<h2>To Whom It May Concern</h2>
<p>This is to certify that <strong>{{salutation}} {{employee_name}}</strong> (Employee Code: {{employee_code}}) was employed with {{company}} from <strong>{{date_of_joining}}</strong> to <strong>{{last_working_day}}</strong>. At the time of leaving, {{pronoun}} held the position of <strong>{{designation}}</strong> in the {{department}} department.</p>
<p>During {{possessive}} tenure we found {{object_pronoun}} to be sincere, hardworking and professional. We wish {{object_pronoun}} every success in {{possessive}} future endeavours.</p>
${SIGN_OFF}`,
  },
  relieving: {
    title: "Relieving Letter",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>Relieving Letter</h2>
<p>Dear {{first_name}},</p>
<p>This has reference to your resignation dated {{resignation_date}}. We wish to inform you that your resignation has been accepted and you are relieved from the services of {{company}} with effect from the close of business hours on <strong>{{last_working_day}}</strong>.</p>
<p>You joined us on {{date_of_joining}} and were working as <strong>{{designation}}</strong> in the {{department}} department at the time of leaving. Your full and final settlement will be processed as per company policy.</p>
<p>We thank you for your contributions and wish you the very best for the future.</p>
${SIGN_OFF}`,
  },
  address_proof: {
    title: "Address Proof Letter",
    body: `${HEAD}
<h2>To Whom It May Concern</h2>
<p>This is to certify that <strong>{{salutation}} {{employee_name}}</strong> (Employee Code: {{employee_code}}) is employed with {{company}} as <strong>{{designation}}</strong> since {{date_of_joining}}.</p>
<p>As per our records, {{possessive}} residential address is:</p>
<p><strong>{{address}}</strong></p>
<p>This letter is issued at the request of the employee for the purpose of <em>{{purpose}}</em>.</p>
${SIGN_OFF}`,
  },
  employment_verification: {
    title: "Employment Verification Letter",
    body: `${HEAD}
<h2>To Whom It May Concern</h2>
<p>This is to confirm that <strong>{{salutation}} {{employee_name}}</strong> (Employee Code: {{employee_code}}) is a {{employment_type}} employee of {{company}}, working as <strong>{{designation}}</strong> in the {{department}} department at our {{location}} office since <strong>{{date_of_joining}}</strong>.</p>
<p>This letter is issued at the request of the employee for the purpose of <em>{{purpose}}</em> and does not constitute any guarantee or liability on the part of the company.</p>
${SIGN_OFF}`,
  },
  salary_certificate: {
    title: "Salary Certificate",
    body: `${HEAD}
<h2>Salary Certificate</h2>
<p>This is to certify that <strong>{{salutation}} {{employee_name}}</strong> (Employee Code: {{employee_code}}) is employed with {{company}} as <strong>{{designation}}</strong> since {{date_of_joining}}. {{possessive_cap}} current compensation is as follows:</p>
<table>
<tr><th>Component</th><th>Monthly (₹)</th><th>Annual (₹)</th></tr>
<tr><td>Basic</td><td>{{basic_monthly}}</td><td>{{basic}}</td></tr>
<tr><td>House Rent Allowance</td><td>{{hra_monthly}}</td><td>{{hra}}</td></tr>
<tr><td>Special Allowance</td><td>{{special_allowance_monthly}}</td><td>{{special_allowance}}</td></tr>
<tr><td><strong>Cost to Company</strong></td><td><strong>{{monthly_ctc}}</strong></td><td><strong>{{annual_ctc}}</strong></td></tr>
</table>
<p>This certificate is issued at the request of the employee for the purpose of <em>{{purpose}}</em>.</p>
${SIGN_OFF}`,
  },
  increment: {
    title: "Salary Revision Letter",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>Salary Revision</h2>
<p>Dear {{first_name}},</p>
<p>In recognition of your performance and contribution, we are pleased to inform you that your annual CTC has been revised from <strong>{{annual_ctc}}</strong> to <strong>{{new_ctc}}</strong> with effect from <strong>{{effective_date}}</strong>.</p>
<p>All other terms and conditions of your employment remain unchanged. We look forward to your continued commitment and wish you success.</p>
${SIGN_OFF}`,
  },
  bonus: {
    title: "Bonus Letter",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>Bonus Award</h2>
<p>Dear {{first_name}},</p>
<p>We are delighted to award you a bonus of <strong>{{bonus_amount}}</strong> in recognition of {{bonus_reason}}. The amount will be paid on or around <strong>{{payout_date}}</strong>, subject to applicable taxes.</p>
<p>Thank you for your hard work and dedication. Keep up the great work!</p>
${SIGN_OFF}`,
  },
  promotion: {
    title: "Promotion Letter",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>Promotion</h2>
<p>Dear {{first_name}},</p>
<p>Congratulations! We are pleased to inform you that you have been promoted from <strong>{{designation}}</strong> to <strong>{{new_designation}}</strong> with effect from <strong>{{effective_date}}</strong>.</p>
<p>Your revised annual CTC will be <strong>{{new_ctc}}</strong>. Your new role brings greater responsibility, and we are confident you will excel in it.</p>
<p>All other terms and conditions of your employment remain unchanged.</p>
${SIGN_OFF}`,
  },
  other: {
    title: "Letter",
    body: `${HEAD}${TO_EMPLOYEE}
<h2>{{subject}}</h2>
<p>Dear {{first_name}},</p>
<p>This letter is issued with reference to {{purpose}}.</p>
<p>[Write the body of the letter here.]</p>
${SIGN_OFF}`,
  },
};

export function buildLetter(type: LetterType, data: LetterData): { title: string; content: string } {
  const t = TEMPLATES[type];
  const title = type === "other" && data.subject && data.subject !== "—" ? data.subject : t.title;
  return { title, content: fillTemplate(t.body, data).trim() };
}
