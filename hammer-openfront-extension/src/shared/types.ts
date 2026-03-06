export interface PlayerData {
  id: string;
  smallID: number | null;
  clientID: string | null;
  name?: string;
  displayName?: string;
  isAlive: boolean;
  team: number | null;
  troops: number;
  gold: number | bigint;
  tilesOwned?: number;
  allies?: number[];
}

export interface DonationRecord {
  gold: number;
  troops: number;
  count: number;
  goldSends: number;
  troopsSends: number;
  last: Date | null;
  lastDonorTroops: number;
}

export interface PortRecord {
  totalGold: number;
  times: number[];
  avgIntSec: number;
  lastIntSec: number;
  gpm: number;
}

export interface CityRecord {
  ownerID: number;
  level: number;
}

export interface LogEntry {
  level: string;
  args: unknown[];
  timestamp: string;
  category?: string | null;
}

export interface CIATransfer {
  ts: number;
  type: string;
  dir: string;
  actorPID: number;
  actorName: string;
  otherName: string;
  senderName: string;
  receiverName: string;
  amount: number;
}

export interface CIAFlowEntry {
  gold: number;
  troops: number;
  goldCount: number;
  troopsCount: number;
  lastTs: number;
  sender: string;
  receiver: string;
}

export interface CIAPlayerTotal {
  sentGold: number;
  sentTroops: number;
  recvGold: number;
  recvTroops: number;
  sentCount: number;
  recvCount: number;
}

export interface CIAAlert {
  ts: number;
  level: string;
  message: string;
}

export interface CIAState {
  transfers: CIATransfer[];
  flowGraph: Map<string, CIAFlowEntry>;
  playerTotals: Map<string, CIAPlayerTotal>;
  alerts: CIAAlert[];
  seen: Set<string>;
}
