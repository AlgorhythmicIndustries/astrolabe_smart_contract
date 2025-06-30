export * from './Batch'
export * from './BatchTransaction'
export * from './ProgramConfig'
export * from './Proposal'
export * from './Settings'
export * from './SettingsTransaction'
export * from './SpendingLimit'
export * from './Transaction'
export * from './TransactionBuffer'

import { Batch } from './Batch'
import { BatchTransaction } from './BatchTransaction'
import { ProgramConfig } from './ProgramConfig'
import { Proposal } from './Proposal'
import { Settings } from './Settings'
import { SettingsTransaction } from './SettingsTransaction'
import { SpendingLimit } from './SpendingLimit'
import { Transaction } from './Transaction'
import { TransactionBuffer } from './TransactionBuffer'

export const accountProviders = {
  Batch,
  BatchTransaction,
  ProgramConfig,
  Proposal,
  Settings,
  SettingsTransaction,
  SpendingLimit,
  Transaction,
  TransactionBuffer,
}
