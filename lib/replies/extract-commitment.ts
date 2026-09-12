import { parseRupeesToPaise } from "@/lib/money";

export interface ExtractedCommitment {
  has_commitment: boolean;
  promised_date: Date | null;
  promised_amount_paise: bigint | null;
  confidence: number;
  raw_text_snippet?: string;
}

/**
 * Extracts payment commitment details (intent, promised date, promised amount)
 * from inbound client communication text.
 */
export function extractCommitmentFromText(
  text: string,
  referenceDate: Date = new Date(),
): ExtractedCommitment {
  const normalized = text.toLowerCase();

  // Commitment keywords
  const commitmentSignals = [
    "will pay",
    "will transfer",
    "will clear",
    "arranging payment",
    "process payment",
    "settle",
    "promise to pay",
    "payment will be made",
    "paying by",
    "shall pay",
    "remitting",
    "payment scheduled",
    "transferring funds",
  ];

  const hasCommitmentSignal = commitmentSignals.some((signal) =>
    normalized.includes(signal),
  );

  if (!hasCommitmentSignal) {
    return {
      has_commitment: false,
      promised_date: null,
      promised_amount_paise: null,
      confidence: 0,
    };
  }

  // 1. Extract Date
  let promisedDate: Date | null = null;

  const tomorrowMatch = normalized.match(/by tomorrow|tomorrow/i);
  const inDaysMatch = normalized.match(/(?:in|after|within)\s+(\d+)\s+days?/i);
  const explicitDateMatch = normalized.match(
    /(?:by|on|before)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?/i,
  );
  const isoDateMatch = normalized.match(
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
  );
  const slashDateMatch = normalized.match(
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/,
  );

  if (tomorrowMatch) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 1);
    promisedDate = d;
  } else if (inDaysMatch && inDaysMatch[1]) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + days);
    promisedDate = d;
  } else if (explicitDateMatch) {
    const day = parseInt(explicitDateMatch[1]!, 10);
    const monthStr = explicitDateMatch[2]!;
    const year = explicitDateMatch[3]
      ? parseInt(explicitDateMatch[3]!, 10)
      : referenceDate.getFullYear();

    const monthIndex = new Date(`${monthStr} 1, 2000`).getMonth();
    promisedDate = new Date(year, monthIndex, day, 18, 0, 0);
  } else if (isoDateMatch) {
    const year = parseInt(isoDateMatch[1]!, 10);
    const month = parseInt(isoDateMatch[2]!, 10) - 1;
    const day = parseInt(isoDateMatch[3]!, 10);
    promisedDate = new Date(year, month, day, 18, 0, 0);
  } else if (slashDateMatch) {
    const day = parseInt(slashDateMatch[1]!, 10);
    const month = parseInt(slashDateMatch[2]!, 10) - 1;
    const year = parseInt(slashDateMatch[3]!, 10);
    promisedDate = new Date(year, month, day, 18, 0, 0);
  } else {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 3);
    promisedDate = d;
  }

  // 2. Extract Amount
  let promisedAmountPaise: bigint | null = null;
  const amountMatch = text.match(
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr)/i,
  );

  if (amountMatch) {
    const rawVal = amountMatch[1] || amountMatch[2];
    if (rawVal) {
      const cleanVal = rawVal.replace(/,/g, "");
      try {
        promisedAmountPaise = parseRupeesToPaise(cleanVal);
      } catch {
        promisedAmountPaise = null;
      }
    }
  }

  return {
    has_commitment: true,
    promised_date: promisedDate,
    promised_amount_paise: promisedAmountPaise,
    confidence: promisedDate ? 0.9 : 0.6,
    raw_text_snippet: text.slice(0, 300),
  };
}
