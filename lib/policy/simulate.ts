import type { CadenceStep } from "./types";

export interface ClientForSimulation {
  client_id: string;
  name: string;
  total_open_paise: bigint;
  earliest_due_date: string | null; // ISO date
  category_id: string | null;
  relationship_tier: string;
}

export interface SimulationInput {
  clients: ClientForSimulation[];
  current_cadence: { steps: CadenceStep[]; max_messages_per_week: number };
  proposed_cadence: { steps: CadenceStep[]; max_messages_per_week: number };
  window_days: number; // typically 30
  global_max_messages_per_week: number;
}

export type SimulationResult = {
  window_days: number;
  current: {
    messages: number;
    clients: number;
    by_channel: Record<string, number>;
  };
  proposed: {
    messages: number;
    clients: number;
    by_channel: Record<string, number>;
  };
  delta_messages: number;
  affected_clients: Array<{
    client_id: string;
    name: string;
    current: number;
    proposed: number;
  }>;
  warnings: string[];
};

function countFiringSteps(
  client: ClientForSimulation,
  steps: CadenceStep[],
  maxMessagesPerWeek: number,
  globalMaxMessagesPerWeek: number,
  windowDays: number,
): { count: number; byChannel: Record<string, number> } {
  const weeksInWindow = Math.ceil(windowDays / 7);
  const cadenceCap = maxMessagesPerWeek * weeksInWindow;
  const globalCap = globalMaxMessagesPerWeek * weeksInWindow;

  const dueDate = new Date(client.earliest_due_date!);
  const byChannel: Record<string, number> = {};
  let count = 0;

  for (const step of steps) {
    const fireDate = new Date(dueDate);
    fireDate.setDate(fireDate.getDate() + step.offset_days_from_due);

    // The step fires if its fire date falls within [dueDate, dueDate + windowDays)
    // relative to the simulation window start (which we treat as today = dueDate context).
    // A step fires if offset_days_from_due is within [0, windowDays).
    if (
      step.offset_days_from_due >= 0 &&
      step.offset_days_from_due < windowDays
    ) {
      count += 1;
      byChannel[step.channel] = (byChannel[step.channel] ?? 0) + 1;
    }
  }

  // Apply cadence cap then global cap
  count = Math.min(count, cadenceCap);
  count = Math.min(count, globalCap);

  // Scale byChannel proportionally if capped
  const rawTotal = Object.values(byChannel).reduce((s, v) => s + v, 0);
  if (rawTotal > 0 && count < rawTotal) {
    const ratio = count / rawTotal;
    for (const ch of Object.keys(byChannel)) {
      byChannel[ch] = Math.round((byChannel[ch] ?? 0) * ratio);
    }
  }

  return { count, byChannel };
}

function mergeByChannel(
  acc: Record<string, number>,
  delta: Record<string, number>,
): Record<string, number> {
  const result = { ...acc };
  for (const [ch, n] of Object.entries(delta)) {
    result[ch] = (result[ch] ?? 0) + n;
  }
  return result;
}

export function simulate(input: SimulationInput): SimulationResult {
  const {
    clients,
    current_cadence,
    proposed_cadence,
    window_days,
    global_max_messages_per_week,
  } = input;

  const zeroed = (
    warning: string,
  ): SimulationResult => ({
    window_days,
    current: { messages: 0, clients: 0, by_channel: {} },
    proposed: { messages: 0, clients: 0, by_channel: {} },
    delta_messages: 0,
    affected_clients: [],
    warnings: [warning],
  });

  // Filter eligible clients: must have a due date and positive balance
  const eligible = clients.filter(
    (c) => c.earliest_due_date !== null && c.total_open_paise > 0n,
  );

  if (eligible.length === 0) {
    return zeroed("No eligible clients in window");
  }

  let currentMessages = 0;
  let currentClients = 0;
  let currentByChannel: Record<string, number> = {};

  let proposedMessages = 0;
  let proposedClients = 0;
  let proposedByChannel: Record<string, number> = {};

  const affectedClients: SimulationResult["affected_clients"] = [];
  const warnings: string[] = [];
  let globalCapHitCount = 0;

  const weeksInWindow = Math.ceil(window_days / 7);
  const globalCap = global_max_messages_per_week * weeksInWindow;

  for (const client of eligible) {
    const cur = countFiringSteps(
      client,
      current_cadence.steps,
      current_cadence.max_messages_per_week,
      global_max_messages_per_week,
      window_days,
    );
    const prop = countFiringSteps(
      client,
      proposed_cadence.steps,
      proposed_cadence.max_messages_per_week,
      global_max_messages_per_week,
      window_days,
    );

    if (cur.count > 0) {
      currentMessages += cur.count;
      currentClients += 1;
      currentByChannel = mergeByChannel(currentByChannel, cur.byChannel);
    }

    if (prop.count > 0) {
      proposedMessages += prop.count;
      proposedClients += 1;
      proposedByChannel = mergeByChannel(proposedByChannel, prop.byChannel);
    }

    if (prop.count !== cur.count) {
      affectedClients.push({
        client_id: client.client_id,
        name: client.name,
        current: cur.count,
        proposed: prop.count,
      });
    }

    // Check if proposed count hit global cap
    if (prop.count >= globalCap) {
      globalCapHitCount += 1;
    }
  }

  // Warnings
  if (globalCapHitCount > 0) {
    warnings.push(
      `Proposed volume exceeds global weekly cap for ${globalCapHitCount} clients`,
    );
  }

  if (
    currentMessages > 0 &&
    proposedMessages >= currentMessages * 2
  ) {
    warnings.push("Proposed volume doubles current volume");
  }

  const strategicClientsWithIncrease = affectedClients
    .filter((ac) => {
      const client = eligible.find((c) => c.client_id === ac.client_id);
      return client?.relationship_tier === "strategic" && ac.proposed > ac.current;
    })
    .map((ac) => ac.name);

  if (strategicClientsWithIncrease.length > 0) {
    warnings.push(
      `Strategic client volume increases: [${strategicClientsWithIncrease.join(", ")}]`,
    );
  }

  return {
    window_days,
    current: {
      messages: currentMessages,
      clients: currentClients,
      by_channel: currentByChannel,
    },
    proposed: {
      messages: proposedMessages,
      clients: proposedClients,
      by_channel: proposedByChannel,
    },
    delta_messages: proposedMessages - currentMessages,
    affected_clients: affectedClients,
    warnings,
  };
}
